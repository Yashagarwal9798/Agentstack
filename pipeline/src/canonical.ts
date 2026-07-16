// Canonical identity + versioning: same id from any source = one capability;
// changed content = update; unchanged = last-seen bump only (no release noise).
import { createHash } from "node:crypto";
import type { CapabilityCard, Catalog } from "@agentstack/shared";

/** Hash of the card minus volatile fields — decides "actually changed". */
export function contentHashOf(card: CapabilityCard): string {
  const { firstSeen: _f, lastChecked: _l, contentHash: _c, ...stable } = card;
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export interface CanonicalResult {
  added: CapabilityCard[];
  updated: CapabilityCard[];
  unchanged: number;
  capabilities: CapabilityCard[]; // full new catalog content
}

export function canonicalize(catalog: Catalog, incoming: CapabilityCard[]): CanonicalResult {
  const byId = new Map(catalog.capabilities.map((c) => [c.id, c]));
  const added: CapabilityCard[] = [];
  const updated: CapabilityCard[] = [];
  let unchanged = 0;

  for (const raw of incoming) {
    const hash = contentHashOf(raw);
    const card: CapabilityCard = { ...raw, contentHash: hash };
    const existing = byId.get(card.id);

    if (!existing) {
      byId.set(card.id, card);
      added.push(card);
      continue;
    }

    // Merge discovery sources: same tool seen via multiple channels stays ONE card.
    const mergedSources = [...existing.sources];
    for (const s of card.sources) {
      if (!mergedSources.some((m) => m.url === s.url)) mergedSources.push(s);
    }

    const merged: CapabilityCard = {
      ...card,
      firstSeen: existing.firstSeen, // provenance: first discovery date survives updates
      sources: mergedSources,
    };
    merged.contentHash = contentHashOf(merged);

    if (merged.contentHash === existing.contentHash) {
      byId.set(card.id, { ...existing, lastChecked: card.lastChecked });
      unchanged++;
    } else {
      byId.set(card.id, merged);
      updated.push(merged);
    }
  }

  return { added, updated, unchanged, capabilities: [...byId.values()] };
}
