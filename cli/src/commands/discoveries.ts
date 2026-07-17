import * as p from "@clack/prompts";
import { loadLocalCatalog, paths, readJson } from "../core/stateStore.js";
import type { AppliedRelease } from "../core/catalogSync.js";
import { staleness } from "../core/catalogSync.js";
import { sym, theme, trustBadge, table } from "../core/ui.js";

export function discoveriesCommand(opts: { since?: string }): void {
  p.intro(theme.brand("agentstack discoveries"));

  const history = readJson<AppliedRelease[]>(paths.releases, []);
  if (history.length === 0) {
    p.outro(theme.dim("no releases applied yet — run `agentstack update`"));
    return;
  }

  if (opts.since && !history.some((r) => r.version === opts.since)) {
    p.cancel(
      `version "${opts.since}" is not in your applied history — known versions: ${history.slice(-5).map((r) => r.version).join(", ")}`,
    );
    process.exit(1);
  }
  const slice = opts.since
    ? history.slice(history.findIndex((r) => r.version === opts.since) + 1)
    : [history[history.length - 1]!];

  const catalog = loadLocalCatalog();
  const byId = new Map(catalog.capabilities.map((c) => [c.id, c]));

  const describe = (id: string): [string, string] => {
    const card = byId.get(id);
    return [
      theme.id(id),
      card ? `${trustBadge(card.trust)} ${card.summary.slice(0, 70)}${card.summary.length > 70 ? "…" : ""}` : theme.dim("(not in mirror)"),
    ];
  };

  for (const release of slice) {
    const header = `${theme.accent(release.version)} ${theme.dim(`applied ${release.appliedAt.slice(0, 16).replace("T", " ")}`)}`;
    console.log(`\n${sym.dot} ${header}`);
    if (release.added.length > 0) {
      console.log(`\n ${sym.plus} ${theme.bold(`new (${release.added.length})`)}`);
      console.log(table(["capability", "about"], release.added.map(describe)));
    }
    if (release.updated.length > 0) {
      console.log(`\n ${sym.tilde} ${theme.bold(`updated (${release.updated.length})`)}`);
      console.log(table(["capability", "about"], release.updated.map(describe)));
    }
    if (release.deprecated.length > 0) {
      console.log(`\n ${sym.minus} ${theme.bold(`deprecated (${release.deprecated.length})`)}`);
      console.log(table(["capability", "about"], release.deprecated.map(describe)));
    }
    if (release.added.length + release.updated.length + release.deprecated.length === 0) {
      console.log(theme.dim("  (empty release)"));
    }
  }

  console.log(`\n${theme.dim("inspect any id:")} ${theme.accent("agentstack inspect <id>")}`);
  const stale = staleness();
  p.outro(stale ? `${sym.warn} ${stale}` : theme.dim(`${slice.length} release(s) shown`));
}
