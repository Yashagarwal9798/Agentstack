// Operator tool: publish pending candidates using operator-supplied enrichment
// judgments (scripts/enrichments.json) instead of live LLM calls — used when
// free-tier rate limits stall the queue. Everything deterministic (skeletons,
// canonical ids, hashes, delta/manifest/checksums) goes through the SAME code
// path as the automated pipeline.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilityCard } from "@agentstack/shared";
import { loadPending, savePending } from "../pipeline/src/pending.js";
import { registrySkeleton, skillSkeleton, sourceHashOf } from "../pipeline/src/process/enrich.js";
import { canonicalize } from "../pipeline/src/canonical.js";
import { loadCatalog, publishRelease } from "../pipeline/src/release.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const enrichments = JSON.parse(readFileSync(join(root, "scripts", "enrichments.json"), "utf8")) as Record<
  string,
  {
    summary: string;
    useWhen: string[];
    doNotUseWhen: string[];
    categories: string[];
    languages: string[];
    permissions: string[];
    localCloud: "local" | "cloud" | "hybrid";
  }
>;

const pending = loadPending();
const now = new Date().toISOString().slice(0, 10);
const cards: CapabilityCard[] = [];
const leftover: typeof pending = [];
let failed = 0;

for (const candidate of pending) {
  if (candidate.source === "rss") {
    leftover.push(candidate); // rss items need classify/verify — never skeleton-published
    continue;
  }
  const enrichment = enrichments[candidate.externalId];
  if (!enrichment) {
    leftover.push(candidate); // no judgment supplied — stays queued for the cron
    continue;
  }
  const skeleton = candidate.source === "mcp-registry" ? registrySkeleton(candidate) : skillSkeleton(candidate);
  const { remoteHint: _hint, ...base } = skeleton;
  const parsed = CapabilityCard.safeParse({
    ...base,
    ...enrichment,
    firstSeen: now,
    lastChecked: now,
    sourceHash: sourceHashOf(candidate),
  });
  if (parsed.success) {
    cards.push(parsed.data);
  } else {
    failed++;
    console.error(`✖ ${candidate.externalId}: ${parsed.error.issues[0]?.path.join(".")} — ${parsed.error.issues[0]?.message}`);
  }
}

console.log(`built ${cards.length} cards (${leftover.length} left queued, ${failed} failed validation)`);
if (failed > 0) process.exit(1);

const result = canonicalize(loadCatalog(), cards);
const release = publishRelease(result.capabilities, result.added, result.updated, []);
if (release) {
  console.log(`RELEASE ${release.version}: +${release.addedCount} added, ~${release.updatedCount} updated`);
} else {
  console.log("nothing to release (all unchanged)");
}
// Consumed candidates leave the queue either way — otherwise "unchanged" items
// would be reprocessed on every future run.
savePending(leftover);
console.log(`pending queue now ${leftover.length}`);
