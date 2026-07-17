#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { updateCommand } from "./commands/update.js";
import { discoveriesCommand } from "./commands/discoveries.js";
import { inspectCommand } from "./commands/inspect.js";
import { projectInitCommand } from "./commands/projectInit.js";
import { recommendCommand } from "./commands/recommend.js";

// Dev convenience: pick up .env.local from the repo root when present.
// (index.js lives at cli/dist/ — two levels below the repo root, unlike core/.)
const repoEnv = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env.local");
if (existsSync(repoEnv)) process.loadEnvFile(repoEnv);

const program = new Command();

program
  .name("agentstack")
  .description("A living, project-aware capability catalog for AI coding agents — private memory via Supermemory Local.")
  .version("0.1.0");

program
  .command("init")
  .description("connect Supermemory, configure the LLM, import starter knowledge")
  .option("-y, --yes", "non-interactive: use env vars and defaults")
  .action(initCommand);

program
  .command("update")
  .description("pull the latest catalog releases into local state + Supermemory")
  .action(updateCommand);

program
  .command("discoveries")
  .description("show new / updated / deprecated capabilities from applied releases")
  .option("--since <version>", "show everything applied after this release")
  .action(discoveriesCommand);

program
  .command("inspect")
  .description("full capability card with provenance and risk summary")
  .argument("<id>", "capability id (or a unique fragment of it)")
  .action(inspectCommand);

program
  .command("recommend")
  .description("build a minimal explained capability stack for this project")
  .action(recommendCommand);

const project = program.command("project").description("project-scoped commands");
project
  .command("init")
  .description("profile this project (idea prompts + light scan) for recommendations")
  .option("--goal <text>", "project description (skips prompts)")
  .option("--stack <text>", "preferred stack")
  .option("--constraints <text>", "hard constraints")
  .option("--stage <stage>", "idea | early | active | maintenance")
  .option("-y, --yes", "skip confirmations")
  .action(projectInitCommand);

program.parseAsync().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
