// Locate the bundled starter content in every runtime shape this CLI has:
// monorepo tsc output (cli/dist/... → repo-root/starter) and the published
// npm package (dist/cli.js → <package-root>/starter). Probe upward.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveStarterDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "starter");
    if (existsSync(join(candidate, "catalog.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
