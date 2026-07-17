import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ProjectProfile } from "@agentstack/shared";
import { Memory } from "../core/memory.js";
import { loadLocalCatalog, paths, readJson, resolveSupermemoryKey, writeJson } from "../core/stateStore.js";
import { buildProfile, lightScan, profileNarrative, type ProfileAnswers } from "../core/profiler.js";
import { staleness } from "../core/catalogSync.js";
import { box, kv, sym, theme } from "../core/ui.js";

interface Opts {
  goal?: string;
  stack?: string;
  constraints?: string;
  stage?: string;
  yes?: boolean;
}

export async function projectInitCommand(opts: Opts): Promise<void> {
  p.intro(theme.brand("agentstack project init"));
  const root = process.cwd();

  const key = resolveSupermemoryKey();
  if (!key) {
    p.cancel("Run `agentstack init` first.");
    process.exit(1);
  }
  const memory = new Memory(key);

  const existing = readJson<ProjectProfile | null>(join(root, ".agentstack", "project.json"), null);
  if (existing && !opts.yes) {
    const overwrite = await p.confirm({
      message: `This directory already has a profile (${theme.accent(existing.slug)}) — rebuild it?`,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.outro(theme.dim("kept the existing profile"));
      return;
    }
  }

  // --- gather answers (flags for scripting, prompts for humans) ---------------
  let answers: ProfileAnswers;
  if (opts.goal) {
    answers = {
      goal: opts.goal,
      stack: opts.stack ?? "",
      constraints: opts.constraints ?? "",
      stage: (opts.stage as ProfileAnswers["stage"]) ?? "idea",
    };
  } else {
    const goal = await p.text({
      message: "Describe the project:",
      placeholder: "A local Electron app for chatting with private PDF documents",
      validate: (v) => (v && v.length > 9 ? undefined : "give me at least a sentence"),
    });
    if (p.isCancel(goal)) return cancelled();
    const stack = await p.text({ message: "Preferred stack:", placeholder: "React, TypeScript, Electron, Ollama (empty = let evidence decide)", defaultValue: "" });
    if (p.isCancel(stack)) return cancelled();
    const constraints = await p.text({ message: "Hard constraints:", placeholder: "No cloud processing; documents must stay local (empty = none)", defaultValue: "" });
    if (p.isCancel(constraints)) return cancelled();
    const stage = await p.select({
      message: "Project stage:",
      options: [
        { value: "idea", label: "idea — nothing built yet" },
        { value: "early", label: "early — some code exists" },
        { value: "active", label: "active — under regular development" },
        { value: "maintenance", label: "maintenance" },
      ],
    });
    if (p.isCancel(stage)) return cancelled();
    answers = { goal, stack, constraints, stage: stage as ProfileAnswers["stage"] };
  }

  // --- scan + structure --------------------------------------------------------
  const s = p.spinner();
  s.start("Scanning project files");
  const catalog = loadLocalCatalog();
  const scan = lightScan(root, catalog);
  s.stop(
    `${sym.ok} Scan: ${scan.declaredStack.length ? `${scan.declaredStack.length} dependencies` : "no manifests"}, ` +
      `${scan.alreadyInstalled.length} installed capabilit${scan.alreadyInstalled.length === 1 ? "y" : "ies"} detected`,
  );

  s.start("Structuring profile with LLM");
  let profile: ProjectProfile;
  try {
    profile = await buildProfile(root, answers, scan);
  } catch (err) {
    s.stop(`${sym.err} Profile structuring failed`);
    p.cancel(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
  s.stop(`${sym.ok} Profile built`);

  // --- show + confirm ------------------------------------------------------------
  console.log(
    box(`project profile · ${profile.slug}`, [
      `${theme.bold("goal")}         ${profile.goal}`,
      `${theme.bold("stack")}        ${profile.stack.join(", ") || theme.dim("(none)")}`,
      ...profile.constraints.map((c) => `${theme.bold("constraint")}   ${c.type === "privacy" ? theme.warn(c.text) : c.text} ${theme.dim(`[${c.type}]`)}`),
      `${theme.bold("stage")}        ${profile.stage}`,
      ...(profile.alreadyInstalled.length
        ? [`${theme.bold("installed")}    ${profile.alreadyInstalled.map((i) => theme.id(i.id)).join(", ")} ${theme.dim("(will not be re-recommended)")}`]
        : []),
    ]),
  );
  if (!opts.yes && !opts.goal) {
    const ok = await p.confirm({ message: "Save this profile?" });
    if (p.isCancel(ok) || !ok) return cancelled();
  }

  // --- persist: project dir + global registry + Supermemory ----------------------
  writeJson(join(root, ".agentstack", "project.json"), profile);
  const registry = readJson<Record<string, string>>(paths.projects, {});
  registry[profile.slug] = root;
  writeJson(paths.projects, registry);
  await memory.addProjectMemory(profile.slug, profileNarrative(profile));

  console.log(kv([["next", `${theme.accent("agentstack recommend")} ${theme.dim("— get a minimal stack for this project")}`]]));
  const stale = staleness();
  p.outro(stale ? `${sym.warn} ${stale}` : theme.dim(`profile saved · memory container project_${profile.slug}`));
}

function cancelled(): never {
  p.cancel("project init cancelled");
  process.exit(1);
}
