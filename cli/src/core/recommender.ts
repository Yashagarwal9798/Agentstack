// The two-path ranking core (architecture §2.6, prd §7.3).
// Deterministic stages are pure functions — unit-tested without LLM/network.
import { z } from "zod";
import type {
  CapabilityCard,
  FeedbackRecord,
  ProjectProfile,
  Recommendation,
  RecommendedItem,
  RejectedItem,
} from "@agentstack/shared";
import { completeJson } from "./llm.js";
import type { SearchHit } from "./memory.js";

// --- stage 1: semantic query ---------------------------------------------------

export function buildQuery(profile: ProjectProfile): string {
  return [
    profile.goal,
    profile.stack.length ? `Stack: ${profile.stack.join(", ")}.` : "",
    profile.constraints.map((c) => c.text).join(". "),
    `Development stage: ${profile.stage}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Group chunk hits by capability id, keeping the best similarity per card. */
export function similarityByCard(hits: SearchHit[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const hit of hits) {
    if (!hit.capabilityId) continue;
    const prev = best.get(hit.capabilityId) ?? 0;
    if (hit.similarity > prev) best.set(hit.capabilityId, hit.similarity);
  }
  return best;
}

// --- stage 3: hard gates ---------------------------------------------------------

export function hardGates(
  cards: CapabilityCard[],
  profile: ProjectProfile,
): { passed: CapabilityCard[]; rejected: RejectedItem[] } {
  const passed: CapabilityCard[] = [];
  const rejected: RejectedItem[] = [];
  const privacy = profile.constraints.some((c) => c.type === "privacy");
  const installed = new Set(profile.alreadyInstalled.flatMap((i) => [i.id, i.id.split("/").pop() ?? i.id]));

  for (const card of cards) {
    const shortName = card.id.split("/").pop() ?? card.id;
    if (card.status !== "active") {
      rejected.push({ id: card.id, stage: "gate", reason: `status is ${card.status}` });
    } else if (!card.agents.includes(profile.targetAgent)) {
      rejected.push({ id: card.id, stage: "gate", reason: `not available for ${profile.targetAgent}` });
    } else if (card.trust === "unverified") {
      rejected.push({ id: card.id, stage: "gate", reason: "unverified source — never auto-recommended" });
    } else if (privacy && card.localCloud === "cloud") {
      rejected.push({ id: card.id, stage: "gate", reason: "cloud service — violates the project's local-only constraint" });
    } else if (installed.has(card.id) || installed.has(shortName)) {
      rejected.push({ id: card.id, stage: "gate", reason: "already installed in this project" });
    } else {
      passed.push(card);
    }
  }
  return { passed, rejected };
}

// --- stage 4: deterministic scoring (prd §14.1 weights) ---------------------------

export interface ScoredCard {
  card: CapabilityCard;
  score: number;
  notes: string[];
}

export function baseScore(card: CapabilityCard, profile: ProjectProfile, similarity: number): ScoredCard {
  const notes: string[] = [];

  // relevance 35 — semantic similarity (typical range ~0.4–0.9)
  const relevance = Math.round(Math.max(0, Math.min(1, (similarity - 0.35) / 0.5)) * 35);

  // compatibility 20 — stack/language overlap (generic cards fit everything)
  const stack = new Set(profile.stack.map((s) => s.toLowerCase()));
  const langMatches = card.languages.filter((l) => stack.has(l.toLowerCase())).length;
  const compatibility = card.languages.length === 0 ? 14 : Math.min(20, 8 + langMatches * 6);
  if (langMatches > 0) notes.push(`matches stack (${card.languages.filter((l) => stack.has(l.toLowerCase())).join(", ")})`);

  // trust 15
  const trust = { official: 15, curated: 12, community: 7, unverified: 0 }[card.trust];

  // maintenance/freshness 10
  const ageDays = (Date.now() - new Date(card.lastChecked).getTime()) / 86_400_000;
  const maintenance = ageDays < 30 ? 10 : ageDays < 120 ? 6 : 3;

  // privacy/permission fit 5
  const privacy = profile.constraints.some((c) => c.type === "privacy");
  const privacyFit = privacy ? { local: 5, hybrid: 2, cloud: 0 }[card.localCloud] : 3;
  if (privacy && card.localCloud === "local") notes.push("runs fully local (privacy fit)");

  // installation complexity 5
  const complexity = card.installation.requiredSecrets.length === 0 ? 5 : 2;
  if (card.installation.requiredSecrets.length > 0) notes.push(`needs secrets: ${card.installation.requiredSecrets.join(", ")}`);

  return { card, score: relevance + compatibility + trust + maintenance + privacyFit + complexity, notes };
}

// --- path 1: exact-id feedback adjustments ------------------------------------------

export function applyFeedback(scored: ScoredCard, feedback: FeedbackRecord[]): ScoredCard {
  let delta = 0;
  const notes = [...scored.notes];
  for (const record of feedback) {
    if (record.capabilityId !== scored.card.id) continue;
    if (record.verdict === "not_useful") {
      delta -= 18;
      notes.push(`you marked this not useful in project "${record.projectSlug}"${record.note ? ` (${record.note})` : ""}`);
    } else {
      delta += 8;
      notes.push(`useful in your project "${record.projectSlug}"`);
    }
  }
  return { ...scored, score: Math.max(0, Math.min(100, scored.score + delta)), notes };
}

// --- stage 6: LLM rerank + explain (path 2 memories in context) ----------------------

const LlmRanking = z.object({
  recommended: z.array(
    z.object({
      id: z.string(),
      explanation: z.string(),
      memoryInfluence: z.string().optional(),
    }),
  ),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })),
});

export async function rankWithLlm(
  profile: ProjectProfile,
  candidates: ScoredCard[],
  experienceMemories: SearchHit[],
): Promise<{ recommended: RecommendedItem[]; rejected: RejectedItem[] }> {
  const byId = new Map(candidates.map((c) => [c.card.id, c]));
  const listing = candidates
    .map(
      (c) =>
        `- ${c.card.id} (score ${c.score}) [${c.card.type}, ${c.card.localCloud}, trust: ${c.card.trust}]\n  ${c.card.summary}\n  categories: ${c.card.categories.join(", ")}${c.notes.length ? `\n  notes: ${c.notes.join("; ")}` : ""}`,
    )
    .join("\n");
  const memories = experienceMemories.map((m) => `- ${m.memory}`).join("\n");

  const fallback = (): { recommended: RecommendedItem[]; rejected: RejectedItem[] } => ({
    recommended: candidates.slice(0, 4).map((c) => ({
      id: c.card.id,
      score: c.score,
      explanation: `${c.card.summary} ${c.notes.length ? `(${c.notes.join("; ")})` : ""}`.trim(),
    })),
    rejected: candidates.slice(4).map((c) => ({ id: c.card.id, stage: "llm" as const, reason: "outside the minimal stack" })),
  });

  let raw: z.infer<typeof LlmRanking>;
  try {
    raw = await completeJson(
      `You are selecting a MINIMAL capability stack (3-5 items) for a software project. Prefer fewer, non-overlapping capabilities; reject the rest with a short concrete reason.

Project:
${buildQuery(profile)}

Candidates (pre-scored deterministically — you may reorder or exclude but NEVER add ids that are not listed):
${listing}

${memories ? `The user's past experience (from their private memory — cite it in "memoryInfluence" when it changes a decision, phrased naturally like "you've consistently avoided cloud processing"):\n${memories}` : "No past experience memories available."}

Return {"recommended": [{id, explanation, memoryInfluence?}], "rejected": [{id, reason}]} covering EVERY candidate id exactly once.`,
      LlmRanking,
    );
  } catch {
    return fallback(); // LLM down — deterministic ranking still ships
  }

  // Enforce the contract: no invented ids, no resurrection, everything covered.
  const recommended: RecommendedItem[] = [];
  const rejected: RejectedItem[] = [];
  const seen = new Set<string>();
  for (const item of raw.recommended) {
    const match = byId.get(item.id);
    if (!match || seen.has(item.id) || recommended.length >= 6) continue;
    seen.add(item.id);
    // memoryInfluence is only meaningful when memories were actually supplied;
    // models otherwise stuff junk ("low", "n/a") into the optional field.
    const influence = item.memoryInfluence?.trim();
    recommended.push({
      id: match.card.id,
      score: match.score,
      explanation: item.explanation,
      memoryInfluence: experienceMemories.length > 0 && influence && influence.length >= 20 ? influence : undefined,
    });
  }
  for (const item of raw.rejected) {
    const match = byId.get(item.id);
    if (!match || seen.has(item.id)) continue;
    seen.add(item.id);
    rejected.push({ id: match.card.id, stage: "llm", reason: item.reason });
  }
  for (const c of candidates) {
    if (!seen.has(c.card.id)) rejected.push({ id: c.card.id, stage: "llm", reason: "not selected for the minimal stack" });
  }
  if (recommended.length === 0) return fallback();
  return { recommended, rejected };
}

// --- orchestration (pure part — command supplies IO) ----------------------------------

export interface RecommendInputs {
  profile: ProjectProfile;
  hits: SearchHit[];
  catalogCards: CapabilityCard[];
  feedback: FeedbackRecord[];
  experienceMemories: SearchHit[];
  catalogRelease: string;
}

export async function recommend(inputs: RecommendInputs): Promise<Recommendation> {
  const sim = similarityByCard(inputs.hits);
  const cardById = new Map(inputs.catalogCards.map((c) => [c.id, c]));
  const retrieved = [...sim.keys()].map((id) => cardById.get(id)).filter((c): c is CapabilityCard => Boolean(c));

  const { passed, rejected: gateRejected } = hardGates(retrieved, inputs.profile);

  const scored = passed
    .map((card) => applyFeedback(baseScore(card, inputs.profile, sim.get(card.id) ?? 0), inputs.feedback))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12); // top candidates go to the LLM

  const { recommended, rejected: llmRejected } = await rankWithLlm(inputs.profile, scored, inputs.experienceMemories);

  return {
    projectSlug: inputs.profile.slug,
    catalogRelease: inputs.catalogRelease,
    createdAt: new Date().toISOString(),
    recommended,
    rejected: [...gateRejected, ...llmRejected],
  };
}
