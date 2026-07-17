// Full pipeline run: collect → (enrich | classify/verify/extract) → canonicalize
// → release. Cursors and the pending queue persist ONLY after the release step
// succeeded, so a crashed run is safely re-runnable (upserts make replays no-ops).
import { existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadCursors, saveCursors, STATE_DIR } from "./cursors.js";
import { collectAll } from "./collect.js";
import { loadPending, savePending, enqueue } from "./pending.js";
import { enrichBatch, sourceHashOf } from "./process/enrich.js";
import { processRss } from "./process/rss.js";
import { canonicalize } from "./canonical.js";
import { loadCatalog, publishRelease } from "./release.js";
import { pipelineLlm } from "./llmEnv.js";
import type { RawCandidate } from "./types.js";

const MAX_PER_RUN = Number(process.env.AGENTSTACK_PIPELINE_MAX ?? 120);

// Local convenience: load .env.local from repo root when present (Actions uses secrets).
const envFile = join(STATE_DIR, "..", "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

function logAppend(file: string, lines: string[]): void {
  if (lines.length === 0) return;
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(join(STATE_DIR, file), lines.map((l) => `${new Date().toISOString()} ${l}`).join("\n") + "\n", "utf8");
}

const llm = pipelineLlm();
const catalog = loadCatalog();

// --- 1. collect --------------------------------------------------------------
const outcome = await collectAll(loadCursors());
for (const f of outcome.failures) console.error(`  source FAILED: ${f.source}: ${f.error}`);
if (outcome.failures.length === 3) {
  console.error("all sources failed — aborting so CI shows red instead of a silent no-op");
  process.exit(1);
}
let queue = enqueue(loadPending(), outcome.candidates);
console.log(`collected ${outcome.candidates.length} new; queue now ${queue.length}`);

// --- 2. take a bounded batch, skip unchanged evidence -------------------------
const existingById = new Map(catalog.capabilities.map((c) => [c.id, c]));
const derivedId = (c: RawCandidate) =>
  c.source === "mcp-registry" ? `mcp:${c.externalId}` : c.source === "skills-repo" ? `skill:anthropics/${c.title}` : undefined;

const batch: RawCandidate[] = [];
const rest: RawCandidate[] = [];
let skippedUnchanged = 0;
for (const c of queue) {
  const id = derivedId(c);
  const existing = id ? existingById.get(id) : undefined;
  if (existing?.sourceHash === sourceHashOf(c)) {
    skippedUnchanged++; // evidence unchanged — no re-extraction (spec §10.6)
    continue;
  }
  if (batch.length < MAX_PER_RUN) batch.push(c);
  else rest.push(c);
}
console.log(`processing ${batch.length} (skipped ${skippedUnchanged} unchanged, ${rest.length} left queued)`);

// --- 3. route by source --------------------------------------------------------
const registryAndSkills = batch.filter((c) => c.source !== "rss");
const rssItems = batch.filter((c) => c.source === "rss");

const enriched = await enrichBatch(registryAndSkills, llm);
const rss = await processRss(rssItems, llm);

logAppend("failures.log", [...enriched.failures, ...rss.failures]);
logAppend("review.log", rss.held.map((h) => `${h.externalId}: ${h.reason}`));
console.log(
  `enriched ${enriched.cards.length}/${registryAndSkills.length} registry+skills; ` +
    `rss: ${rss.cards.length} extracted, ${rss.held.length} held for review, ${rss.dropped} dropped as noise; ` +
    `${enriched.failures.length + rss.failures.length} failures`,
);

// --- 4. canonicalize + release --------------------------------------------------
const result = canonicalize(catalog, [...enriched.cards, ...rss.cards]);
const release = publishRelease(result.capabilities, result.added, result.updated, []);

if (release) {
  console.log(
    `RELEASE ${release.version}: +${release.addedCount} added, ~${release.updatedCount} updated, ` +
      `${result.unchanged} unchanged (no delta entry)`,
  );
} else {
  console.log("no changes — no release published");
}

// --- 5. persist queue + cursors (only now, after release succeeded) ------------
if (enriched.requeue.length + rss.requeue.length > 0) {
  console.log(`requeueing ${enriched.requeue.length + rss.requeue.length} candidates from failed batches`);
}
savePending([...rest, ...enriched.requeue, ...rss.requeue]);
saveCursors(outcome.cursors);
console.log(`state saved: ${rest.length} queued for next run; cursors advanced for ${3 - outcome.failures.length}/3 sources`);
