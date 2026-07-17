// Registry and skills-repo candidates are capabilities BY CONSTRUCTION — the
// deterministic fields come from source data; the LLM only fills the judgment
// fields (useWhen, categories, localCloud, ...) in batched calls that respect
// free-tier token limits.
import { createHash } from "node:crypto";
import { z } from "zod";
import { chatJson, CapabilityCard, type LlmSettings } from "@agentstack/shared";
import type { RawCandidate } from "../types.js";
import { withTimeout } from "../util.js";

const BATCH_SIZE = 10;
const BATCH_TIMEOUT_MS = 5 * 60 * 1000;

// Models often return a bare array instead of {items: [...]} — accept both.
const Enrichment = z.preprocess(
  (v) => (Array.isArray(v) ? { items: v } : v),
  z.object({
    items: z.array(
      z.object({
        externalId: z.string(),
        summary: z.string(),
        useWhen: z.array(z.string()).min(1),
        doNotUseWhen: z.array(z.string()),
        categories: z.array(z.string()).min(1),
        languages: z.array(z.string()),
        permissions: z.array(z.string()),
        localCloud: z.enum(["local", "cloud", "hybrid"]),
      }),
    ),
  }),
);

export function sourceHashOf(candidate: RawCandidate): string {
  return createHash("sha256").update(`${candidate.title}\n${candidate.body}`).digest("hex");
}

interface RegistryPackage {
  registryType?: string;
  identifier?: string;
  environmentVariables?: Array<{ name?: string }>;
}
interface RegistryRemote {
  type?: string;
  url?: string;
}

/** Deterministic parts of a registry card (no LLM). */
function registrySkeleton(c: RawCandidate) {
  const versionMatch = c.body.match(/Version: (\S+)/);
  let packages: RegistryPackage[] = [];
  let remotes: RegistryRemote[] = [];
  try {
    packages = JSON.parse(c.body.match(/Packages: (\[.*?\])$/m)?.[1] ?? "[]") as RegistryPackage[];
  } catch { /* malformed source JSON — treat as none */ }
  try {
    remotes = JSON.parse(c.body.match(/Remotes: (\[.*?\])$/m)?.[1] ?? "[]") as RegistryRemote[];
  } catch { /* malformed source JSON — treat as none */ }

  const npm = packages.find((p) => p.registryType === "npm" && p.identifier);
  const remote = remotes.find((r) => r.url);
  const requiredSecrets = [
    ...new Set(packages.flatMap((p) => (p.environmentVariables ?? []).map((e) => e.name).filter(Boolean))),
  ] as string[];

  return {
    id: `mcp:${c.externalId}`,
    name: c.title,
    type: "mcp" as const,
    agents: ["claude-code"],
    installation: {
      ...(npm ? { command: `npx -y ${npm.identifier}` } : {}),
      mcpConfig: npm
        ? { command: "npx", args: ["-y", npm.identifier as string] }
        : remote
          ? { type: remote.type ?? "streamable-http", url: remote.url as string }
          : undefined,
      requiredSecrets,
    },
    version: versionMatch?.[1] ?? "unknown",
    status: "active" as const,
    trust: c.externalId.startsWith("io.modelcontextprotocol") ? ("official" as const) : ("community" as const),
    sources: [{ url: c.url, kind: "registry" as const }],
    remoteHint: remote ? "has remote URL (hosted service)" : "package runs locally",
  };
}

/** Deterministic parts of a skills-repo card (no LLM). */
function skillSkeleton(c: RawCandidate) {
  const fm = c.body.match(/^---\s*\n([\s\S]*?)\n---/);
  const name = fm?.[1]?.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? c.title;
  return {
    id: `skill:anthropics/${c.title}`,
    name,
    type: "skill" as const,
    agents: ["claude-code"],
    installation: { requiredSecrets: [] as string[] },
    version: "main",
    status: "active" as const,
    trust: "official" as const,
    sources: [{ url: c.url, kind: "repo" as const }],
    remoteHint: "instruction file, runs locally",
  };
}

/** Enrich a homogeneous batch of registry/skills candidates into full cards. */
export async function enrichBatch(
  candidates: RawCandidate[],
  llm: LlmSettings,
): Promise<{ cards: CapabilityCard[]; failures: string[]; requeue: RawCandidate[] }> {
  const cards: CapabilityCard[] = [];
  const failures: string[] = [];
  const requeue: RawCandidate[] = [];
  const now = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    // Pace batches to stay under free-tier tokens/minute (Groq: 6k TPM).
    if (i > 0) await new Promise((r) => setTimeout(r, 30_000));
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const listing = batch
      .map(
        (c, n) =>
          `${n + 1}. externalId: ${c.externalId}\n   title: ${c.title}\n   description: ${c.body.slice(0, 700)}`,
      )
      .join("\n\n");

    const prompt = `These are ${batch[0]!.source === "mcp-registry" ? "MCP servers from the official registry" : "Agent Skills (SKILL.md instruction files)"} for AI coding agents.
Return a JSON object shaped exactly as {"items": [...]} with one entry per input item.
For EACH item return: externalId (copy exactly), summary (one clear sentence), useWhen (2-3 concrete situations), doNotUseWhen (1-2), categories (2-3 lowercase tags like frontend/testing/database/web-search/memory/docs), languages (programming languages it is tied to, [] if generic), permissions (subset of: filesystem, network, browser, credentials, shell — judge from what it does), localCloud ("local" if it runs fully on the user's machine, "cloud" if it calls a hosted third-party service, "hybrid" if both).
Do not invent facts not implied by the description. If unsure about a field, be conservative.

${listing}`;

    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batchTotal = Math.ceil(candidates.length / BATCH_SIZE);
    try {
      const result = await withTimeout(chatJson(prompt, Enrichment, llm), BATCH_TIMEOUT_MS, `enrich batch ${batchNo}`);
      const byId = new Map(result.items.map((i) => [i.externalId, i]));
      for (const c of batch) {
        const enriched = byId.get(c.externalId);
        if (!enriched) {
          failures.push(`${c.externalId}: missing from enrichment response`);
          continue;
        }
        const skeleton = c.source === "mcp-registry" ? registrySkeleton(c) : skillSkeleton(c);
        const { remoteHint: _hint, ...base } = skeleton;
        const card = CapabilityCard.safeParse({
          ...base,
          summary: enriched.summary,
          useWhen: enriched.useWhen,
          doNotUseWhen: enriched.doNotUseWhen,
          categories: enriched.categories,
          languages: enriched.languages,
          permissions: enriched.permissions,
          localCloud: enriched.localCloud,
          firstSeen: now,
          lastChecked: now,
          sourceHash: sourceHashOf(c),
        });
        if (card.success) cards.push(card.data);
        else failures.push(`${c.externalId}: ${card.error.issues[0]?.message ?? "schema error"}`);
      }
      console.log(`  enrich batch ${batchNo}/${batchTotal} done (${cards.length} cards so far)`);
    } catch (err) {
      // Whole-batch failure is transient (LLM shape/rate/hang) — retry next run.
      for (const c of batch) failures.push(`${c.externalId}: batch failed — ${String(err).slice(0, 120)}`);
      requeue.push(...batch);
      console.log(`  enrich batch ${batchNo}/${batchTotal} FAILED (requeued): ${String(err).slice(0, 100)}`);
    }
  }

  return { cards, failures, requeue };
}
