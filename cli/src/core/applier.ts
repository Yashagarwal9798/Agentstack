// Plan/execute separation (architecture §2.7): the PLAN is pure and fully
// renderable for --dry-run; EXECUTE performs file writes ONLY — never runs a
// command. Executable steps become a human checklist.
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityCard, ProjectProfile, Recommendation, StackLock } from "@agentstack/shared";
import { claudeCode, type AgentAdapter } from "../adapters/claudeCode.js";

import { resolveStarterDir } from "./starterDir.js";

const BUNDLED_SKILLS = join(resolveStarterDir() ?? "no-starter", "skills");

export interface PlanAction {
  capabilityId: string;
  kind: "skill-bundled" | "skill-fetch" | "mcp-entry";
  path: string;
  detail: string;
  risks: string[];
  /** for skill-fetch: raw URL to download the SKILL.md text from */
  fetchUrl?: string;
}

export interface ApplyPlan {
  actions: PlanAction[];
  sharedFiles: Array<{ path: string; detail: string; exists: boolean }>;
  checklist: string[];
  skipped: Array<{ capabilityId: string; reason: string }>;
}

function rawSkillUrl(card: CapabilityCard): string | undefined {
  const repoSource = card.sources.find((s) => s.url.includes("github.com") && s.url.includes("SKILL.md"));
  if (!repoSource) return undefined;
  return repoSource.url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
}

function riskLines(card: CapabilityCard): string[] {
  const risks: string[] = [];
  const risky = card.permissions.filter((p) => ["browser", "network", "shell", "credentials", "filesystem"].includes(p));
  if (risky.length > 0) risks.push(`permissions: ${risky.join(", ")}`);
  if (card.installation.requiredSecrets.length > 0) risks.push(`needs secrets: ${card.installation.requiredSecrets.join(", ")}`);
  if (card.localCloud !== "local") risks.push(`runs ${card.localCloud} — data may leave the machine`);
  if (card.trust === "community") risks.push("community trust tier — review the source before heavy use");
  return risks;
}

export function buildPlan(
  recommendation: Recommendation,
  cardById: Map<string, CapabilityCard>,
  root: string,
  adapter: AgentAdapter = claudeCode,
): ApplyPlan {
  const plan: ApplyPlan = { actions: [], sharedFiles: [], checklist: [], skipped: [] };

  for (const item of recommendation.recommended) {
    const card = cardById.get(item.id);
    if (!card) {
      plan.skipped.push({ capabilityId: item.id, reason: "not in local catalog (run agentstack update)" });
      continue;
    }
    if (card.type === "skill") {
      const shortName = card.id.split("/").pop()!;
      const dest = join(adapter.skillsDir(root), shortName, "SKILL.md");
      const bundled = join(BUNDLED_SKILLS, shortName, "SKILL.md");
      if (existsSync(bundled)) {
        plan.actions.push({ capabilityId: card.id, kind: "skill-bundled", path: dest, detail: `copy bundled skill "${shortName}"`, risks: riskLines(card) });
      } else {
        const url = rawSkillUrl(card);
        if (url) {
          plan.actions.push({ capabilityId: card.id, kind: "skill-fetch", path: dest, detail: `download SKILL.md from ${card.sources[0]?.url ?? url}`, risks: riskLines(card), fetchUrl: url });
        } else {
          plan.skipped.push({ capabilityId: card.id, reason: "no bundled copy and no fetchable source — see `agentstack inspect`" });
        }
      }
    } else {
      const entry = adapter.renderMcpEntry(card);
      if (entry) {
        plan.actions.push({ capabilityId: card.id, kind: "mcp-entry", path: adapter.mcpConfigPath(root), detail: `add mcpServers.${entry.key}`, risks: riskLines(card) });
        for (const secret of card.installation.requiredSecrets) {
          plan.checklist.push(`set ${secret} in your environment (needed by ${entry.key})`);
        }
      } else if (card.installation.command) {
        plan.checklist.push(`run yourself: ${card.installation.command}  (${card.id} has no MCP config — manual install)`);
      } else {
        plan.skipped.push({ capabilityId: card.id, reason: "no mcp config and no install command in the card" });
      }
    }
  }

  for (const [path, detail] of [
    [adapter.instructionFile(root), "create or update the agentstack-managed section"],
    [join(root, "AI_STACK.md"), "regenerate (selection + rejection rationale)"],
    [join(root, ".agentstack", "stack.lock.json"), "record exact ids/versions/release"],
  ] as const) {
    plan.sharedFiles.push({ path, detail, exists: existsSync(path) });
  }

  return plan;
}

const BEGIN = "<!-- agentstack:begin -->";
const END = "<!-- agentstack:end -->";

function claudeMdSection(profile: ProjectProfile, applied: CapabilityCard[]): string {
  const lines = [
    BEGIN,
    "## AI capability stack (managed by AgentStack Radar)",
    "",
    `Project: ${profile.goal}`,
    ...(profile.constraints.length ? [`Constraints: ${profile.constraints.map((c) => c.text).join("; ")}`] : []),
    "",
    "Installed capabilities and when to use them:",
    ...applied.map((c) => `- **${c.name}** (${c.type}): ${c.useWhen[0] ?? c.summary}`),
    "",
    "Full rationale in AI_STACK.md. Do not hand-edit this section — `agentstack apply` regenerates it.",
    END,
  ];
  return lines.join("\n");
}

function upsertClaudeMd(path: string, section: string): "created" | "updated" {
  if (!existsSync(path)) {
    writeFileSync(path, `# CLAUDE.md\n\n${section}\n`, "utf8");
    return "created";
  }
  const current = readFileSync(path, "utf8");
  const start = current.indexOf(BEGIN);
  const end = current.indexOf(END);
  const next =
    start !== -1 && end !== -1
      ? current.slice(0, start) + section + current.slice(end + END.length)
      : `${current.trimEnd()}\n\n${section}\n`;
  writeFileSync(path, next, "utf8");
  return "updated";
}

function aiStackMd(profile: ProjectProfile, recommendation: Recommendation, applied: CapabilityCard[], rejectedByUser: Array<{ id: string; reason: string }>): string {
  const cardLine = (c: CapabilityCard) => {
    const item = recommendation.recommended.find((r) => r.id === c.id);
    return [
      `### ${c.name} (\`${c.id}\`)`,
      `- ${c.summary}`,
      `- why: ${item?.explanation ?? "selected"}`,
      ...(item?.memoryInfluence ? [`- memory: ${item.memoryInfluence}`] : []),
      `- trust: ${c.trust} · runs ${c.localCloud} · version ${c.version}`,
      ...(c.permissions.length ? [`- permissions: ${c.permissions.join(", ")}`] : []),
      ...(c.installation.requiredSecrets.length ? [`- secrets required: ${c.installation.requiredSecrets.join(", ")}`] : []),
      `- provenance: ${c.sources.map((s) => s.url).join(" · ")}`,
    ].join("\n");
  };
  return [
    "# AI Stack — generated by AgentStack Radar",
    "",
    `Project: **${profile.slug}** — ${profile.goal}`,
    `Catalog release: ${recommendation.catalogRelease} · applied ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Installed",
    "",
    ...applied.map(cardLine),
    "",
    "## Not selected",
    "",
    ...recommendation.rejected.slice(0, 15).map((r) => `- \`${r.id}\` — ${r.reason}`),
    ...(rejectedByUser.length ? ["", "## Rejected by you at apply time", "", ...rejectedByUser.map((r) => `- \`${r.id}\` — ${r.reason}`)] : []),
    "",
  ].join("\n");
}

export interface ExecuteResult {
  written: string[];
  lock: StackLock;
}

export async function executePlan(
  plan: ApplyPlan,
  approvedIds: Set<string>,
  recommendation: Recommendation,
  profile: ProjectProfile,
  cardById: Map<string, CapabilityCard>,
  root: string,
  rejectedByUser: Array<{ id: string; reason: string }>,
  adapter: AgentAdapter = claudeCode,
): Promise<ExecuteResult> {
  const written: string[] = [];
  const applied: CapabilityCard[] = [];

  for (const action of plan.actions) {
    if (!approvedIds.has(action.capabilityId)) continue;
    const card = cardById.get(action.capabilityId)!;

    if (action.kind === "skill-bundled") {
      const srcDir = join(BUNDLED_SKILLS, card.id.split("/").pop()!);
      const destDir = dirname(action.path);
      mkdirSync(destDir, { recursive: true });
      for (const f of readdirSync(srcDir)) copyFileSync(join(srcDir, f), join(destDir, f));
      written.push(action.path);
    } else if (action.kind === "skill-fetch") {
      const res = await fetch(action.fetchUrl!, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`fetching ${action.fetchUrl} → HTTP ${res.status}`);
      mkdirSync(dirname(action.path), { recursive: true });
      writeFileSync(action.path, await res.text(), "utf8");
      written.push(action.path);
    } else {
      const entry = adapter.renderMcpEntry(card)!;
      const mcpPath = action.path;
      const config = existsSync(mcpPath)
        ? (JSON.parse(readFileSync(mcpPath, "utf8").replace(/^﻿/, "")) as { mcpServers?: Record<string, unknown> })
        : {};
      config.mcpServers = { ...config.mcpServers, [entry.key]: entry.entry };
      writeFileSync(mcpPath, JSON.stringify(config, null, 2) + "\n", "utf8");
      written.push(mcpPath);
    }
    applied.push(card);
  }

  // Cumulative stack: capabilities applied in EARLIER runs stay in the lock
  // and the CLAUDE.md section — recommend hard-filters installed items, so a
  // second apply must never erase the first one's record.
  const lockPath = join(root, ".agentstack", "stack.lock.json");
  const prevLock = existsSync(lockPath)
    ? (JSON.parse(readFileSync(lockPath, "utf8")) as StackLock)
    : null;
  const appliedIds = new Set(applied.map((c) => c.id));
  const carried = (prevLock?.capabilities ?? []).filter((c) => !appliedIds.has(c.id));
  const carriedCards = carried
    .map((c) => cardById.get(c.id))
    .filter((c): c is CapabilityCard => Boolean(c));
  const fullStack = [...carriedCards, ...applied];

  const claudePath = adapter.instructionFile(root);
  upsertClaudeMd(claudePath, claudeMdSection(profile, fullStack));
  written.push(claudePath);

  const aiStackPath = join(root, "AI_STACK.md");
  writeFileSync(aiStackPath, aiStackMd(profile, recommendation, fullStack, rejectedByUser), "utf8");
  written.push(aiStackPath);

  const lock: StackLock = {
    catalogRelease: recommendation.catalogRelease,
    capabilities: [
      ...carried,
      ...applied.map((c) => ({
        id: c.id,
        version: c.version,
        installedAs: (c.type === "skill" ? "skill" : "mcp-config") as "skill" | "mcp-config",
        approvedAt: new Date().toISOString(),
        source: c.sources[0]?.url ?? "",
      })),
    ],
  };
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");
  written.push(lockPath);

  return { written, lock };
}
