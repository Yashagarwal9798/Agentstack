// Phase 3 runner: collect raw candidates from all sources with independent
// failure handling. A source's cursor advances ONLY when it fully succeeded.
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadCursors, saveCursors, STATE_DIR } from "./cursors.js";
import { collectMcpRegistry } from "./sources/mcpRegistry.js";
import { collectSkillsRepo } from "./sources/skillsRepo.js";
import { collectRss } from "./sources/rss.js";
import type { Cursors, RawCandidate } from "./types.js";

export interface CollectOutcome {
  candidates: RawCandidate[];
  cursors: Cursors;
  failures: Array<{ source: string; error: string }>;
}

/** Collects from every source; returns staged cursors without persisting them. */
export async function collectAll(cursors: Cursors): Promise<CollectOutcome> {
  const staged: Cursors = { ...cursors };
  const candidates: RawCandidate[] = [];
  const failures: Array<{ source: string; error: string }> = [];

  const [registry, skills, rss] = await Promise.allSettled([
    collectMcpRegistry(cursors.mcpRegistry),
    collectSkillsRepo(cursors.skillsRepo),
    collectRss(cursors.rss),
  ]);

  if (registry.status === "fulfilled") {
    candidates.push(...registry.value.candidates);
    staged.mcpRegistry = registry.value.nextCursor;
  } else failures.push({ source: "mcp-registry", error: String(registry.reason) });

  if (skills.status === "fulfilled") {
    candidates.push(...skills.value.candidates);
    staged.skillsRepo = skills.value.nextCursor;
  } else failures.push({ source: "skills-repo", error: String(skills.reason) });

  if (rss.status === "fulfilled") {
    candidates.push(...rss.value.candidates);
    staged.rss = rss.value.nextCursor;
  } else failures.push({ source: "rss", error: String(rss.reason) });

  return { candidates, cursors: staged, failures };
}

// --- standalone runner (phase 3 verification; phase 4 will call collectAll) ---
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (isMain) {
  const outcome = await collectAll(loadCursors());

  const counts = new Map<string, number>();
  for (const c of outcome.candidates) counts.set(c.source, (counts.get(c.source) ?? 0) + 1);
  console.log("collected candidates:");
  for (const source of ["mcp-registry", "skills-repo", "rss"]) {
    const failed = outcome.failures.find((f) => f.source === source);
    console.log(`  ${source.padEnd(14)} ${failed ? `FAILED: ${failed.error}` : (counts.get(source) ?? 0)}`);
  }
  console.log(`  total          ${outcome.candidates.length}`);

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, "candidates.json"), JSON.stringify(outcome.candidates, null, 2) + "\n", "utf8");
  saveCursors(outcome.cursors);
  console.log(`cursors advanced for ${3 - outcome.failures.length}/3 sources; candidates written to catalog/state/candidates.json`);

  if (outcome.failures.length === 3) {
    console.error("all sources failed");
    process.exit(1);
  }
}
