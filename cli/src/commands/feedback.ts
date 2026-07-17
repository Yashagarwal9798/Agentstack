import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ProjectProfile, StackLock } from "@agentstack/shared";
import { Memory } from "../core/memory.js";
import { appendFeedback, readJson, resolveSupermemoryKey } from "../core/stateStore.js";
import { box, sym, theme } from "../core/ui.js";

interface Opts {
  /** repeatable: "<capabilityId>=useful|not_useful[:note]" for scripting */
  verdict?: string[];
}

export async function feedbackCommand(opts: Opts): Promise<void> {
  p.intro(theme.brand("agentstack feedback"));
  const root = process.cwd();

  const profile = readJson<ProjectProfile | null>(join(root, ".agentstack", "project.json"), null);
  const lock = readJson<StackLock | null>(join(root, ".agentstack", "stack.lock.json"), null);
  if (!profile || !lock || lock.capabilities.length === 0) {
    p.cancel("Nothing to review — apply a stack here first (`agentstack apply`).");
    process.exit(1);
  }

  const verdicts: Array<{ id: string; verdict: "useful" | "not_useful"; note?: string }> = [];

  if (opts.verdict && opts.verdict.length > 0) {
    for (const spec of opts.verdict) {
      const eq = spec.indexOf("=");
      if (eq === -1) continue;
      const id = spec.slice(0, eq);
      const [v, ...note] = spec.slice(eq + 1).split(":");
      if (v !== "useful" && v !== "not_useful") continue;
      verdicts.push({ id, verdict: v, note: note.join(":") || undefined });
    }
  } else {
    console.log(theme.dim(`\n  reviewing ${lock.capabilities.length} installed capabilit${lock.capabilities.length === 1 ? "y" : "ies"} in "${profile.slug}"\n`));
    for (const cap of lock.capabilities) {
      const useful = await p.confirm({ message: `Was ${theme.bold(cap.id)} useful in this project?` });
      if (p.isCancel(useful)) {
        p.cancel("feedback cancelled");
        process.exit(1);
      }
      let note: string | undefined;
      if (!useful) {
        const why = await p.text({ message: "One line on why not? (optional, sharpens future recommendations)", defaultValue: "" });
        note = p.isCancel(why) || !why ? undefined : why;
      }
      verdicts.push({ id: cap.id, verdict: useful ? "useful" : "not_useful", note });
    }
  }

  if (verdicts.length === 0) {
    p.outro(theme.dim("no verdicts given"));
    return;
  }

  // Dual-write: deterministic twin (Path 1) + semantic twin (Path 2).
  const date = new Date().toISOString().slice(0, 10);
  for (const v of verdicts) {
    appendFeedback({ capabilityId: v.id, projectSlug: profile.slug, verdict: v.verdict, note: v.note, date });
  }

  const key = resolveSupermemoryKey();
  let memoryOk = false;
  if (key) {
    const memory = new Memory(key);
    const s = p.spinner();
    s.start("Storing verdicts in experience memory");
    try {
      for (const v of verdicts) {
        await memory.addExperience(
          `In project "${profile.slug}" (${profile.goal}), the user judged ${v.id} as ${v.verdict === "useful" ? "useful" : "NOT useful"}${v.note ? ` — their words: "${v.note}"` : ""}.`,
          profile.slug,
        );
      }
      memoryOk = true;
      s.stop(`${sym.ok} ${verdicts.length} verdict(s) stored in experience memory`);
    } catch {
      s.stop(`${sym.warn} verdicts saved locally; memory write failed`);
    }
  }

  console.log(
    box(`feedback · ${profile.slug}`, [
      ...verdicts.map((v) => `${v.verdict === "useful" ? theme.ok(sym.ok) : theme.err(sym.err)} ${theme.id(v.id)}${v.note ? theme.dim(` — ${v.note}`) : ""}`),
      theme.dim(`recorded locally${memoryOk ? " + semantic memory" : ""} — future recommendations in ANY project will feel this`),
    ]),
  );
  p.outro(theme.dim("the loop is closed"));
}
