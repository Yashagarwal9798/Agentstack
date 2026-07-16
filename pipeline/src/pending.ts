import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { STATE_DIR } from "./cursors.js";
import type { RawCandidate } from "./types.js";

/** Free-tier LLM limits mean we can't always process everything collected in
 *  one run — unprocessed candidates queue here and drain on later runs. */
const PENDING_PATH = join(STATE_DIR, "pending.json");

export function loadPending(): RawCandidate[] {
  if (!existsSync(PENDING_PATH)) return [];
  return JSON.parse(readFileSync(PENDING_PATH, "utf8")) as RawCandidate[];
}

export function savePending(candidates: RawCandidate[]): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${PENDING_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(candidates, null, 2) + "\n", "utf8");
  renameSync(tmp, PENDING_PATH);
}

/** Merge new candidates into the queue, deduping by source+externalId (newest wins). */
export function enqueue(queue: RawCandidate[], fresh: RawCandidate[]): RawCandidate[] {
  const byKey = new Map<string, RawCandidate>();
  for (const c of [...queue, ...fresh]) byKey.set(`${c.source}::${c.externalId}`, c);
  return [...byKey.values()];
}
