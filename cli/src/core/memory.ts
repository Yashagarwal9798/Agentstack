import Supermemory from "supermemory";
import type { CapabilityCard } from "@agentstack/shared";

/** Hackathon rule: the local server only — never api.supermemory.ai. */
export const SUPERMEMORY_URL = "http://localhost:6767";

export const CONTAINERS = {
  catalog: "catalog",
  project: (slug: string) => `project_${slug}`,
  experience: "experience",
} as const;

export interface SearchHit {
  id: string;
  memory: string;
  similarity: number;
  /** Set for catalog hits: maps the (LLM-rewritten) memory back to its card. */
  capabilityId?: string;
  metadata: Record<string, unknown> | null;
}

/** Local server (v0.0.5) allows only [a-zA-Z0-9_:-] in customId — colons yes, dots no. */
export function toCustomId(capabilityId: string): string {
  return capabilityId.replace(/[^a-zA-Z0-9_:-]/g, "_");
}

/** Narrative form of a card for semantic retrieval (deterministic twin stays in JSON). */
export function cardToNarrative(card: CapabilityCard): string {
  const lines = [
    `${card.name} (${card.id}) is a ${card.type} capability. ${card.summary}`,
    `Use it when: ${card.useWhen.join("; ")}.`,
  ];
  if (card.doNotUseWhen.length > 0) lines.push(`Do not use it when: ${card.doNotUseWhen.join("; ")}.`);
  lines.push(`Categories: ${card.categories.join(", ")}.`);
  if (card.languages.length > 0) lines.push(`Languages: ${card.languages.join(", ")}.`);
  if (card.permissions.length > 0) lines.push(`Required permissions: ${card.permissions.join(", ")}.`);
  lines.push(`It runs ${card.localCloud}. Trust tier: ${card.trust}. Status: ${card.status}.`);
  return lines.join("\n");
}

export class Memory {
  private client: Supermemory;

  constructor(apiKey: string) {
    this.client = new Supermemory({ apiKey, baseURL: SUPERMEMORY_URL });
  }

  /** True when the local server answers on port 6767. */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(SUPERMEMORY_URL, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Add-or-update a catalog card (customId ⇒ update-in-place, verified in phase 0). */
  async upsertCard(card: CapabilityCard): Promise<void> {
    await this.client.add({
      content: cardToNarrative(card),
      containerTag: CONTAINERS.catalog,
      customId: toCustomId(card.id),
      metadata: {
        capabilityId: card.id,
        type: card.type,
        status: card.status,
        trust: card.trust,
        localCloud: card.localCloud,
      },
    });
  }

  async addProjectMemory(slug: string, text: string): Promise<void> {
    await this.client.add({ content: text, containerTag: CONTAINERS.project(slug) });
  }

  async addExperience(text: string, projectSlug: string): Promise<void> {
    await this.client.add({
      content: text,
      containerTag: CONTAINERS.experience,
      metadata: { projectSlug },
    });
  }

  async searchCatalog(query: string, limit = 20): Promise<SearchHit[]> {
    return this.search(query, CONTAINERS.catalog, limit);
  }

  async searchExperience(query: string, limit = 10): Promise<SearchHit[]> {
    return this.search(query, CONTAINERS.experience, limit);
  }

  async searchProject(slug: string, query: string, limit = 10): Promise<SearchHit[]> {
    return this.search(query, CONTAINERS.project(slug), limit);
  }

  private async search(query: string, containerTag: string, limit: number): Promise<SearchHit[]> {
    const res = await this.client.search.memories({ q: query, containerTag, limit });
    const results = (res.results ?? []) as Array<{
      id: string;
      memory?: string;
      similarity?: number;
      metadata?: Record<string, unknown> | null;
    }>;
    return results.map((r) => ({
      id: r.id,
      memory: r.memory ?? "",
      similarity: r.similarity ?? 0,
      capabilityId: typeof r.metadata?.capabilityId === "string" ? r.metadata.capabilityId : undefined,
      metadata: r.metadata ?? null,
    }));
  }
}
