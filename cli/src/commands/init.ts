import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { Catalog } from "@agentstack/shared";
import { Memory } from "../core/memory.js";
import {
  loadConfig,
  saveConfig,
  loadLocalCatalog,
  saveLocalCatalog,
  resolveSupermemoryKey,
  resolveLlm,
  DEFAULT_LLM,
} from "../core/stateStore.js";
import { runUpdate } from "../core/catalogSync.js";
import { banner, box, kv, sym, theme } from "../core/ui.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const STARTER_DIR = join(repoRoot, "starter");

const PROVIDERS = [
  { value: "groq", label: "Groq (free tier, fast)", baseURL: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { value: "gemini", label: "Google Gemini", baseURL: DEFAULT_LLM.baseURL, model: DEFAULT_LLM.model },
  { value: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { value: "custom", label: "Custom OpenAI-compatible endpoint", baseURL: "", model: "" },
] as const;

export async function initCommand(opts: { yes?: boolean }): Promise<void> {
  console.log(banner());
  p.intro(theme.brand("agentstack init"));

  // --- environment checks ----------------------------------------------------
  const s = p.spinner();
  s.start("Checking environment");
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 22) {
    s.stop(`${sym.err} Node ${process.versions.node} — need ≥ 22`);
    process.exit(1);
  }
  s.stop(`${sym.ok} Node ${process.versions.node}`);

  // --- Supermemory -----------------------------------------------------------
  const config = loadConfig();
  let smKey = resolveSupermemoryKey(config);
  if (!smKey && !opts.yes) {
    const answer = await p.password({
      message: "Supermemory Local API key (printed when the server starts, sm_…):",
      validate: (v) => (v?.startsWith("sm_") ? undefined : "expected a key starting with sm_"),
    });
    if (p.isCancel(answer)) return cancelled();
    smKey = answer;
    config.supermemoryApiKey = answer;
  }
  if (!smKey) {
    p.cancel("No Supermemory key (set SUPERMEMORY_API_KEY or run without --yes).");
    process.exit(1);
  }
  const memory = new Memory(smKey);
  s.start("Connecting to Supermemory Local");
  if (!(await memory.health())) {
    s.stop(`${sym.err} Not reachable at http://localhost:6767`);
    p.note("Start it first:  npx supermemory local", "fix");
    process.exit(1);
  }
  s.stop(`${sym.ok} Supermemory Local connected ${theme.dim("(http://localhost:6767)")}`);

  // --- LLM provider ------------------------------------------------------------
  const envLlm = resolveLlm(config);
  if (opts.yes || envLlm.apiKey) {
    config.llm = { baseURL: envLlm.baseURL, model: envLlm.model, apiKey: config.llm.apiKey };
    p.log.success(`${sym.ok} LLM: ${theme.accent(envLlm.model)} ${theme.dim(`via ${envLlm.baseURL} (key from ${config.llm.apiKey ? "config" : "env"})`)}`);
  } else {
    const choice = await p.select({
      message: "Which LLM should analyze your projects?",
      options: PROVIDERS.map((pr) => ({ value: pr.value, label: pr.label })),
    });
    if (p.isCancel(choice)) return cancelled();
    const preset = PROVIDERS.find((pr) => pr.value === choice)!;
    let baseURL = preset.baseURL;
    let model = preset.model;
    if (choice === "custom") {
      const urlAns = await p.text({ message: "Base URL (OpenAI-compatible):", placeholder: "https://…/v1" });
      if (p.isCancel(urlAns)) return cancelled();
      const modelAns = await p.text({ message: "Model id:" });
      if (p.isCancel(modelAns)) return cancelled();
      baseURL = urlAns;
      model = modelAns;
    }
    const keyAns = await p.password({ message: `${preset.label} API key:` });
    if (p.isCancel(keyAns)) return cancelled();
    config.llm = { baseURL, model, apiKey: keyAns };
  }

  // --- target agent -------------------------------------------------------------
  config.targetAgent = "claude-code";
  p.log.info(`${sym.dot} Target coding agent: ${theme.accent("Claude Code")} ${theme.dim("(Cursor/Codex adapters: roadmap)")}`);
  saveConfig(config);

  // --- starter catalog ------------------------------------------------------------
  s.start("Importing starter catalog");
  const starterPath = join(STARTER_DIR, "catalog.json");
  if (!existsSync(starterPath)) {
    // Installed outside the repo checkout — the live catalog sync below still
    // gives a full catalog; starter content is only a cold-start convenience.
    s.stop(`${sym.warn} Starter content not found ${theme.dim("(running outside a repo checkout — the catalog sync below covers it)")}`);
  } else {
    try {
      const starter = Catalog.parse(JSON.parse(readFileSync(starterPath, "utf8")));
      const mirror = loadLocalCatalog();
      const byId = new Map(mirror.capabilities.map((c) => [c.id, c]));
      let imported = 0;
      for (const card of starter.capabilities) {
        if (!byId.has(card.id)) {
          byId.set(card.id, card); // never overwrite live catalog cards with starter data
          imported++;
        }
        await memory.upsertCard(byId.get(card.id)!);
      }
      saveLocalCatalog({ ...mirror, capabilities: [...byId.values()] });
      s.stop(`${sym.ok} Starter catalog imported ${theme.dim(`(${imported} new of ${starter.capabilities.length} cards)`)}`);
    } catch (err) {
      s.stop(`${sym.warn} Starter import failed ${theme.dim(String(err instanceof Error ? err.message : err).slice(0, 80))}`);
    }
  }

  // --- bundled core skills ----------------------------------------------------------
  const skillNames = ["project-planning", "root-cause-debugging", "verification-before-completion"];
  let chosen: string[] = opts.yes ? skillNames : [];
  if (!opts.yes) {
    const answer = await p.multiselect({
      message: "Install the bundled core skills for your agent? (text-only, trusted)",
      options: skillNames.map((n) => ({ value: n, label: n })),
      initialValues: skillNames,
      required: false,
    });
    if (p.isCancel(answer)) return cancelled();
    chosen = answer as string[];
  }
  const skillsDir = join(homedir(), ".claude", "skills");
  for (const name of chosen) {
    const src = join(STARTER_DIR, "skills", name);
    if (!existsSync(src)) continue; // no bundled content outside the checkout
    mkdirSync(join(skillsDir, name), { recursive: true });
    cpSync(src, join(skillsDir, name), { recursive: true });
  }
  if (chosen.length > 0) {
    p.log.success(`${sym.ok} ${chosen.length} core skill(s) installed to ${theme.dim(skillsDir)}`);
  }

  // --- first catalog sync -------------------------------------------------------------
  s.start("Syncing global catalog");
  try {
    const summary = await runUpdate(memory, (msg) => s.message(`Syncing global catalog ${theme.dim(`· ${msg}`)}`));
    s.stop(
      summary.upToDate
        ? `${sym.ok} Catalog already current ${theme.dim(`(${summary.toVersion})`)}`
        : `${sym.ok} Catalog synced to ${theme.accent(summary.toVersion)} ${theme.dim(`(+${summary.addedCount} / ~${summary.updatedCount} / −${summary.deprecatedCount})`)}`,
    );
  } catch (err) {
    s.stop(`${sym.warn} Catalog sync failed ${theme.dim("(starter catalog still available)")}`);
    p.log.warn(String(err instanceof Error ? err.message : err));
  }

  // --- health summary (folded-in doctor) -------------------------------------------------
  const final = loadConfig();
  console.log(
    box("setup complete", [
      `${sym.ok} supermemory   ${theme.dim("http://localhost:6767")}`,
      `${sym.ok} llm           ${theme.accent(final.llm.model)}`,
      `${sym.ok} agent         claude-code`,
      `${sym.ok} catalog       ${theme.accent(final.lastSync?.version ?? "starter only")}`,
      `${sym.ok} skills        ${chosen.length ? chosen.join(", ") : theme.dim("none installed")}`,
    ]),
  );
  console.log(kv([
    ["next", `${theme.accent("agentstack project init")} ${theme.dim("— in your project directory")}`],
    ["then", `${theme.accent("agentstack recommend")}`],
  ]));

  p.outro(theme.dim("memories index in the background — searches get richer over the next minutes"));
}

function cancelled(): never {
  p.cancel("init cancelled");
  process.exit(1);
}
