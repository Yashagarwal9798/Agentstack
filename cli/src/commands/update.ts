import * as p from "@clack/prompts";
import { Memory } from "../core/memory.js";
import { resolveSupermemoryKey } from "../core/stateStore.js";
import { runUpdate } from "../core/catalogSync.js";
import { sym, theme, box } from "../core/ui.js";

export async function updateCommand(): Promise<void> {
  p.intro(theme.brand("agentstack update"));

  const key = resolveSupermemoryKey();
  if (!key) {
    p.cancel("Supermemory API key not configured — run `agentstack init` first.");
    process.exit(1);
  }
  const memory = new Memory(key);

  const s = p.spinner();
  s.start("Checking Supermemory Local");
  if (!(await memory.health())) {
    s.stop(`${sym.err} Supermemory Local is not reachable at :6767`);
    p.note("Start it with:  npx supermemory local", "fix");
    process.exit(1);
  }
  s.stop(`${sym.ok} Supermemory Local reachable`);

  s.start("Syncing catalog");
  try {
    const summary = await runUpdate(memory, (msg) => (s.message(`Syncing catalog ${theme.dim(`· ${msg}`)}`)));
    if (summary.upToDate) {
      s.stop(`${sym.ok} Already up to date ${theme.dim(`(${summary.toVersion})`)}`);
    } else {
      s.stop(`${sym.ok} Synced ${theme.dim(summary.fromVersion)} ${sym.arrow} ${theme.accent(summary.toVersion)}`);
      const lines = [
        `${sym.plus} ${summary.addedCount} new capabilities`,
        `${sym.tilde} ${summary.updatedCount} updated`,
        `${sym.minus} ${summary.deprecatedCount} deprecated`,
        theme.dim(`${summary.applied.length} release(s) applied · memories index in background`),
      ];
      for (const hit of summary.installedAffected) {
        lines.push(`${sym.warn} installed capability affected: ${theme.id(hit)}`);
      }
      console.log(box("update digest", lines));
      if (summary.addedCount > 0) {
        p.note("agentstack discoveries", "see what's new");
      }
    }
  } catch (err) {
    s.stop(`${sym.err} Update failed`);
    p.cancel(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }

  p.outro(theme.dim("done"));
}
