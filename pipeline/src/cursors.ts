import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Cursors } from "./types.js";

/** Pipeline state lives in the repo itself (architecture.md §2.1) — no server. */
const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const STATE_DIR = join(repoRoot, "catalog", "state");
export const CURSORS_PATH = join(STATE_DIR, "cursors.json");

export function loadCursors(): Cursors {
  if (!existsSync(CURSORS_PATH)) return {};
  return JSON.parse(readFileSync(CURSORS_PATH, "utf8")) as Cursors;
}

export function saveCursors(cursors: Cursors): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${CURSORS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(cursors, null, 2) + "\n", "utf8");
  renameSync(tmp, CURSORS_PATH);
}
