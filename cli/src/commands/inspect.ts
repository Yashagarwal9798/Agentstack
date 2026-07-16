import * as p from "@clack/prompts";
import { loadLocalCatalog, paths, readJson } from "../core/stateStore.js";
import { staleness } from "../core/catalogSync.js";
import { kv, localCloudBadge, statusBadge, sym, theme, trustBadge } from "../core/ui.js";

const RISKY = new Set(["browser", "shell", "credentials", "network", "filesystem"]);

export function inspectCommand(id: string): void {
  p.intro(theme.brand("agentstack inspect"));

  const catalog = loadLocalCatalog();
  let card = catalog.capabilities.find((c) => c.id === id);
  if (!card) {
    const matches = catalog.capabilities.filter((c) => c.id.includes(id) || c.name.toLowerCase().includes(id.toLowerCase()));
    if (matches.length === 1) card = matches[0];
    else if (matches.length > 1) {
      p.log.warn(`"${id}" is ambiguous — did you mean:`);
      for (const m of matches.slice(0, 8)) console.log(`  ${theme.id(m.id)}`);
      p.outro(theme.dim(`${matches.length} matches`));
      return;
    }
  }
  if (!card) {
    p.cancel(`no capability matching "${id}" in the local catalog (${catalog.capabilities.length} cards)`);
    process.exit(1);
  }

  console.log(`\n  ${theme.bold(card.name)}  ${trustBadge(card.trust)} ${localCloudBadge(card.localCloud)} ${statusBadge(card.status)}\n`);
  console.log(`  ${card.summary}\n`);

  console.log(kv([
    ["id", theme.id(card.id)],
    ["type", card.type],
    ["version", card.version],
    ["categories", card.categories.join(", ")],
    ["languages", card.languages.length ? card.languages.join(", ") : theme.dim("generic")],
    ["agents", card.agents.join(", ")],
  ]));

  console.log(`\n  ${theme.bold("use when")}`);
  for (const u of card.useWhen) console.log(`    ${sym.ok} ${u}`);
  if (card.doNotUseWhen.length > 0) {
    console.log(`  ${theme.bold("not when")}`);
    for (const u of card.doNotUseWhen) console.log(`    ${sym.err} ${u}`);
  }

  if (card.permissions.length > 0) {
    const rendered = card.permissions.map((perm) => (RISKY.has(perm) ? theme.warn(perm) : perm)).join(", ");
    console.log(`\n  ${theme.bold("permissions")}  ${sym.warn} ${rendered}`);
  }
  if (card.installation.requiredSecrets.length > 0) {
    console.log(`  ${theme.bold("secrets")}      ${card.installation.requiredSecrets.join(", ")}`);
  }
  if (card.installation.command) {
    console.log(`\n  ${theme.bold("install")}  ${theme.accent(card.installation.command)} ${theme.dim("(never run automatically)")}`);
  }
  if (card.installation.mcpConfig) {
    console.log(`  ${theme.bold("mcp config")}  ${theme.dim(JSON.stringify(card.installation.mcpConfig))}`);
  }

  console.log(`\n  ${theme.bold("provenance")}`);
  console.log(kv([
    ["first seen", card.firstSeen],
    ["last checked", card.lastChecked],
    ...card.sources.map((s, i) => [`source ${i + 1}`, `${theme.dim(`[${s.kind}]`)} ${s.url}`] as [string, string]),
  ], 4));

  // Installed where?
  const projects = readJson<Record<string, string>>(paths.projects, {});
  const installedIn: string[] = [];
  for (const slug of Object.keys(projects)) {
    const install = readJson<{ capabilities?: Array<{ id: string }> }>(paths.install(slug), {});
    if ((install.capabilities ?? []).some((c) => c.id === card.id)) installedIn.push(slug);
  }
  if (installedIn.length > 0) {
    console.log(`\n  ${sym.dot} installed in: ${installedIn.map((s) => theme.accent(s)).join(", ")}`);
  }

  const stale = staleness();
  p.outro(stale ? `${sym.warn} ${stale}` : theme.dim("from local catalog mirror"));
}
