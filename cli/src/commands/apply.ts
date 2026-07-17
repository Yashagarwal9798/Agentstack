import { join } from "node:path";
import * as p from "@clack/prompts";
import type { ProjectProfile, Recommendation } from "@agentstack/shared";
import { Memory } from "../core/memory.js";
import { loadConfig, loadLocalCatalog, paths, readJson, resolveSupermemoryKey, writeJson } from "../core/stateStore.js";
import { buildPlan, executePlan } from "../core/applier.js";
import { box, kv, sym, theme } from "../core/ui.js";

interface Opts {
  dryRun?: boolean;
  yes?: boolean;
  reject?: string[];
}

export async function applyCommand(opts: Opts): Promise<void> {
  p.intro(theme.brand(`agentstack apply${opts.dryRun ? " --dry-run" : ""}`));
  const root = process.cwd();

  const profile = readJson<ProjectProfile | null>(join(root, ".agentstack", "project.json"), null);
  const recommendation = readJson<Recommendation | null>(join(root, ".agentstack", "recommendation.json"), null);
  if (!profile || !recommendation) {
    p.cancel("Need a profile and a recommendation here — run `agentstack project init` then `agentstack recommend`.");
    process.exit(1);
  }

  // Refuse stale recommendations: the catalog moved on (architecture §2.7).
  const config = loadConfig();
  const currentRelease = config.lastSync?.version;
  if (currentRelease && recommendation.catalogRelease !== currentRelease) {
    p.cancel(`This recommendation was made against catalog ${recommendation.catalogRelease}, but you're on ${currentRelease} — run \`agentstack recommend\` again.`);
    process.exit(1);
  }

  const catalog = loadLocalCatalog();
  const cardById = new Map(catalog.capabilities.map((c) => [c.id, c]));
  const plan = buildPlan(recommendation, cardById, root);

  // --- render the plan ---------------------------------------------------------
  console.log(`\n${theme.bold("Planned changes")} ${theme.dim(`· ${plan.actions.length} capability action(s)`)}\n`);
  for (const action of plan.actions) {
    const card = cardById.get(action.capabilityId);
    console.log(`  ${sym.plus} ${theme.bold(card?.name ?? action.capabilityId)} ${theme.dim(`(${action.capabilityId})`)}`);
    console.log(`     ${theme.dim("→")} ${action.path}`);
    console.log(`     ${action.detail}`);
    for (const risk of action.risks) console.log(`     ${sym.warn} ${theme.warn(risk)}`);
  }
  console.log(`\n${theme.bold("Generated files")}`);
  for (const f of plan.sharedFiles) {
    console.log(`  ${f.exists ? sym.tilde : sym.plus} ${f.path} ${theme.dim(`— ${f.detail}`)}`);
  }
  if (plan.checklist.length > 0) {
    console.log(`\n${theme.bold("Run yourself")} ${theme.dim("(agentstack never executes commands)")}`);
    for (const c of plan.checklist) console.log(`  ${sym.dot} ${c}`);
  }
  for (const s of plan.skipped) console.log(`  ${sym.minus} ${theme.dim(`${s.capabilityId} skipped — ${s.reason}`)}`);

  if (opts.dryRun) {
    console.log("\n" + kv([["next", `${theme.accent("agentstack apply")} ${theme.dim("— apply with per-item approval")}`]]));
    p.outro(theme.dim("dry run — nothing was changed"));
    return;
  }

  // --- approvals -----------------------------------------------------------------
  // Capability ids contain a colon (mcp:ns/name), so match --reject specs
  // against the plan's actual ids instead of naive splitting.
  const rejectedByUser: Array<{ id: string; reason: string }> = [];
  for (const spec of opts.reject ?? []) {
    const action = plan.actions.find((a) => spec === a.capabilityId || spec.startsWith(`${a.capabilityId}:`));
    if (action) {
      const reason = spec.slice(action.capabilityId.length + 1);
      rejectedByUser.push({ id: action.capabilityId, reason: reason || "rejected by user at apply time" });
    } else {
      console.log(`  ${sym.warn} --reject "${spec.slice(0, 60)}" matches no planned capability — ignored`);
    }
  }
  const rejectedIds = new Set(rejectedByUser.map((r) => r.id));
  const approvedIds = new Set<string>();

  for (const action of plan.actions) {
    if (rejectedIds.has(action.capabilityId)) continue;
    if (opts.yes) {
      approvedIds.add(action.capabilityId);
      continue;
    }
    const card = cardById.get(action.capabilityId);
    const ok = await p.confirm({ message: `Install ${theme.bold(card?.name ?? action.capabilityId)}? ${theme.dim(action.detail)}` });
    if (p.isCancel(ok)) {
      p.cancel("apply cancelled — nothing was changed");
      process.exit(1);
    }
    if (ok) {
      approvedIds.add(action.capabilityId);
    } else {
      const reason = await p.text({ message: "Why? (stored as memory — improves future recommendations)", defaultValue: "not needed" });
      rejectedByUser.push({ id: action.capabilityId, reason: p.isCancel(reason) ? "rejected" : reason });
    }
  }

  // --- execute ---------------------------------------------------------------------
  const s = p.spinner();
  s.start("Writing files");
  let written: string[];
  try {
    const result = await executePlan(plan, approvedIds, recommendation, profile, cardById, root, rejectedByUser);
    written = result.written;
  } catch (err) {
    s.stop(`${sym.err} apply failed`);
    p.cancel(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
  s.stop(`${sym.ok} ${written.length} file(s) written`);

  // --- record + capture decisions (dual-write: local + experience) ------------------
  writeJson(paths.install(profile.slug), {
    slug: profile.slug,
    root,
    appliedAt: new Date().toISOString(),
    catalogRelease: recommendation.catalogRelease,
    approved: [...approvedIds],
    rejected: rejectedByUser,
    files: written,
  });

  const key = resolveSupermemoryKey();
  if (key) {
    const memory = new Memory(key);
    s.start("Storing decisions in memory");
    let stored = 0;
    try {
      for (const id of approvedIds) {
        const card = cardById.get(id)!;
        const item = recommendation.recommended.find((r) => r.id === id);
        await memory.addExperience(
          `In project "${profile.slug}" (${profile.goal}), the user accepted and installed ${card.name} (${id}). Reason it was selected: ${item?.explanation ?? card.summary}`,
          profile.slug,
        );
        stored++;
      }
      for (const r of rejectedByUser) {
        await memory.addExperience(
          `In project "${profile.slug}" (${profile.goal}), the user rejected ${r.id} at apply time. Their reason: ${r.reason}`,
          profile.slug,
        );
        stored++;
      }
      s.stop(`${sym.ok} ${stored} decision(s) stored in experience memory`);
    } catch {
      s.stop(`${sym.warn} decisions saved locally; memory write failed (supermemory offline?)`);
    }
  }

  console.log(
    box(`applied · ${profile.slug}`, [
      `${theme.bold("installed")}  ${[...approvedIds].map((id) => theme.id(id)).join(", ") || theme.dim("(none)")}`,
      ...(rejectedByUser.length ? [`${theme.bold("rejected")}   ${rejectedByUser.map((r) => theme.id(r.id)).join(", ")}`] : []),
      `${theme.bold("lock file")}  .agentstack/stack.lock.json ${theme.dim(`@ ${recommendation.catalogRelease}`)}`,
    ]),
  );
  console.log(kv([["next", `${theme.accent("agentstack feedback")} ${theme.dim("— after using the stack, close the loop")}`]]));
  p.outro(theme.dim("apply complete — no commands were executed"));
}
