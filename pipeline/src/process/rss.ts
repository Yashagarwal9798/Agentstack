// RSS items are NOISE until proven otherwise: classify (batched) → verify the
// official URL actually exists → extract a full card from real evidence.
import { z } from "zod";
import { chatJson, CapabilityCard, type LlmSettings } from "@agentstack/shared";
import type { RawCandidate } from "../types.js";
import { sourceHashOf } from "./enrich.js";
import { withTimeout } from "../util.js";

const CLASSIFY_BATCH = 15;
const BATCH_TIMEOUT_MS = 5 * 60 * 1000;

// Models often return a bare array instead of {items: [...]} — accept both.
const Classification = z.preprocess(
  (v) => (Array.isArray(v) ? { items: v } : v),
  z.object({
    items: z.array(
      z.object({
        externalId: z.string(),
        relevant: z.boolean(),
        type: z.enum(["mcp", "skill", "cli", "plugin", "information_only", "irrelevant"]),
        confidence: z.number().min(0).max(1),
        officialUrl: z.string().optional(),
        possibleName: z.string().optional(),
      }),
    ),
  }),
);

export interface RssOutcome {
  cards: CapabilityCard[];
  held: Array<{ externalId: string; reason: string }>;
  dropped: number;
  failures: string[];
  requeue: RawCandidate[];
}

async function verifyUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

const Extraction = CapabilityCard.pick({
  name: true,
  summary: true,
  useWhen: true,
  doNotUseWhen: true,
  categories: true,
  languages: true,
  permissions: true,
  localCloud: true,
}).extend({
  namespace: z.string().regex(/^[a-z0-9._-]+$/i),
  shortName: z.string().regex(/^[a-z0-9._-]+$/i),
  installCommand: z.string().optional(),
});

export async function processRss(candidates: RawCandidate[], llm: LlmSettings): Promise<RssOutcome> {
  const outcome: RssOutcome = { cards: [], held: [], dropped: 0, failures: [], requeue: [] };
  if (candidates.length === 0) return outcome;

  // --- classify in batches ---------------------------------------------------
  const classified: Array<{ candidate: RawCandidate; type: "mcp" | "skill" | "cli" | "plugin"; officialUrl?: string }> = [];
  for (let i = 0; i < candidates.length; i += CLASSIFY_BATCH) {
    // Pace batches to stay under free-tier tokens/minute (Groq: 6k TPM).
    if (i > 0) await new Promise((r) => setTimeout(r, 30_000));
    const batch = candidates.slice(i, i + CLASSIFY_BATCH);
    const listing = batch
      .map((c, n) => `${n + 1}. externalId: ${c.externalId}\n   title: ${c.title}\n   text: ${c.body.slice(0, 500)}\n   link: ${c.url}`)
      .join("\n\n");
    const prompt = `These are Hacker News posts mentioning "MCP". For EACH, decide whether it announces a DIRECTLY USABLE capability for AI coding agents (an MCP server, Agent Skill, CLI tool, or coding-agent plugin) — not news, opinion, a question, or a tutorial.
Return per item: externalId (copy exactly), relevant (bool), type (mcp/skill/cli/plugin/information_only/irrelevant), confidence (0-1: how sure you are it is a real installable capability), officialUrl (repository or project URL if visible in the text/link), possibleName.

${listing}`;
    try {
      const result = await withTimeout(chatJson(prompt, Classification, llm), BATCH_TIMEOUT_MS, "rss classify batch");
      const byId = new Map(result.items.map((r) => [r.externalId, r]));
      for (const c of batch) {
        const r = byId.get(c.externalId);
        if (!r || !r.relevant || r.type === "information_only" || r.type === "irrelevant" || r.confidence < 0.5) {
          outcome.dropped++;
          continue;
        }
        if (r.confidence < 0.8) {
          outcome.held.push({ externalId: c.externalId, reason: `medium confidence ${r.confidence.toFixed(2)} (${r.type})` });
          continue;
        }
        classified.push({ candidate: c, type: r.type, officialUrl: r.officialUrl });
      }
    } catch (err) {
      // Whole-batch failure is transient — retry next run.
      for (const c of batch) outcome.failures.push(`${c.externalId}: classify failed — ${String(err).slice(0, 120)}`);
      outcome.requeue.push(...batch);
    }
  }

  // --- verify + extract (high-confidence only; usually a handful per day) -----
  const now = new Date().toISOString().slice(0, 10);
  for (const { candidate, type, officialUrl } of classified) {
    const url = officialUrl ?? candidate.url;
    if (!(await verifyUrl(url))) {
      outcome.held.push({ externalId: candidate.externalId, reason: `official URL unverifiable: ${url}` });
      continue;
    }
    try {
      const extracted = await withTimeout(chatJson(
        `Extract a capability card for this ${type} announced on Hacker News. Use ONLY facts in the evidence; unknown stays conservative.
Also return: namespace (author/org, lowercase, from the URL if possible), shortName (tool name, lowercase, hyphenated), installCommand if explicitly stated.

Evidence:
title: ${candidate.title}
text: ${candidate.body.slice(0, 2000)}
official URL: ${url}`,
        Extraction,
        llm,
      ), BATCH_TIMEOUT_MS, "rss extract");
      const card = CapabilityCard.safeParse({
        id: `${type}:${extracted.namespace}/${extracted.shortName}`,
        name: extracted.name,
        type,
        summary: extracted.summary,
        useWhen: extracted.useWhen,
        doNotUseWhen: extracted.doNotUseWhen,
        categories: extracted.categories,
        agents: ["claude-code"],
        languages: extracted.languages,
        permissions: extracted.permissions,
        installation: {
          ...(extracted.installCommand ? { command: extracted.installCommand } : {}),
          requiredSecrets: [],
        },
        localCloud: extracted.localCloud,
        version: "unknown",
        status: "active",
        // RSS-discovered items are never auto-trusted: URL verified but not curated.
        trust: "community",
        sources: [
          { url, kind: "repo" },
          { url: candidate.url, kind: "rss" },
        ],
        firstSeen: now,
        lastChecked: now,
        sourceHash: sourceHashOf(candidate),
      });
      if (card.success) {
        outcome.cards.push(card.data);
      } else {
        outcome.failures.push(`${candidate.externalId}: ${card.error.issues[0]?.message ?? "schema error"}`);
        outcome.requeue.push(candidate);
      }
    } catch (err) {
      outcome.failures.push(`${candidate.externalId}: extract failed — ${String(err).slice(0, 120)}`);
      outcome.requeue.push(candidate);
    }
  }

  return outcome;
}
