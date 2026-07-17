import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ProjectProfile } from "@agentstack/shared";
import { Memory } from "../core/memory.js";
import { loadConfig, loadFeedback, loadLocalCatalog, readJson, resolveSupermemoryKey, writeJson } from "../core/stateStore.js";
import { buildQuery, recommend } from "../core/recommender.js";
import { profileNarrative } from "../core/profiler.js";
import { staleness } from "../core/catalogSync.js";
import { box, kv, localCloudBadge, sym, theme, trustBadge } from "../core/ui.js";

export async function recommendCommand(): Promise<void> {
  p.intro(theme.brand("agentstack recommend"));
  const root = process.cwd();

  const profile = readJson<ProjectProfile | null>(join(root, ".agentstack", "project.json"), null);
  if (!profile) {
    p.cancel("No project profile here — run `agentstack project init` first.");
    process.exit(1);
  }
  const key = resolveSupermemoryKey();
  if (!key) {
    p.cancel("Run `agentstack init` first.");
    process.exit(1);
  }
  const memory = new Memory(key);

  const s = p.spinner();
  s.start("Checking Supermemory Local");
  if (!(await memory.health())) {
    s.stop(`${sym.err} Supermemory Local not reachable at :6767`);
    p.note("Start it with:  npx supermemory local", "fix");
    process.exit(1);
  }
  s.stop(`${sym.ok} Supermemory Local reachable`);

  const catalog = loadLocalCatalog();
  const config = loadConfig();

  s.start("Searching the catalog semantically");
  const hits = await memory.searchCatalog(buildQuery(profile), 30);
  s.stop(`${sym.ok} ${hits.length} semantic hits across ${new Set(hits.map((h) => h.capabilityId)).size} capabilities`);

  s.start("Retrieving your past experience");
  const experience = await memory.searchExperience(profileNarrative(profile), 8);
  s.stop(
    experience.length > 0
      ? `${sym.ok} ${experience.length} relevant experience memories found`
      : `${sym.ok} no past experience yet ${theme.dim("(first project?)")}`,
  );

  s.start("Ranking (deterministic gates + scores, then LLM)");
  const result = await recommend({
    profile,
    hits,
    catalogCards: catalog.capabilities,
    feedback: loadFeedback(),
    experienceMemories: experience,
    catalogRelease: config.lastSync?.version ?? catalog.version,
  });
  s.stop(`${sym.ok} Ranked: ${result.recommended.length} recommended, ${result.rejected.length} rejected`);

  // --- render ------------------------------------------------------------------
  const cardById = new Map(catalog.capabilities.map((c) => [c.id, c]));
  console.log(`\n${theme.bold("Recommended stack")} ${theme.dim(`· catalog ${result.catalogRelease}`)}\n`);
  result.recommended.forEach((item, i) => {
    const card = cardById.get(item.id);
    console.log(
      `  ${theme.bold(String(i + 1))}. ${theme.bold(card?.name ?? item.id)}  ${theme.dim(item.id)}  score ${theme.score(item.score)}`,
    );
    if (card) console.log(`     ${trustBadge(card.trust)} ${localCloudBadge(card.localCloud)}${card.permissions.length ? theme.dim(`  perms: ${card.permissions.join(", ")}`) : ""}`);
    console.log(`     ${item.explanation}`);
    if (item.memoryInfluence) console.log(`     ${sym.dot} ${theme.accent(item.memoryInfluence)}`);
    console.log("");
  });

  const gateRejects = result.rejected.filter((r) => r.stage === "gate");
  const llmRejects = result.rejected.filter((r) => r.stage !== "gate");
  console.log(theme.bold("Not selected"));
  for (const r of [...gateRejects, ...llmRejects].slice(0, 10)) {
    console.log(`  ${sym.minus} ${theme.id(r.id)} ${theme.dim(`— ${r.reason}`)}`);
  }
  if (result.rejected.length > 10) console.log(theme.dim(`  … and ${result.rejected.length - 10} more`));

  writeJson(join(root, ".agentstack", "recommendation.json"), result);
  console.log("\n" + kv([["next", `${theme.accent("agentstack apply --dry-run")} ${theme.dim("— preview every file change")}`]]));
  const stale = staleness();
  p.outro(stale ? `${sym.warn} ${stale}` : theme.dim("recommendation saved"));
}
