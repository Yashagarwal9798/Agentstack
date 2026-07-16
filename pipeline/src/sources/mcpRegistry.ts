import type { AdapterResult, RawCandidate } from "../types.js";

const BASE = "https://registry.modelcontextprotocol.io";
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;
/** First run has no cursor — bound it (default 24h; env-tunable) instead of paging
 *  the whole registry. The registry gets ~90 updates/day (measured 2026-07-17). */
const INITIAL_WINDOW_MS =
  Number(process.env.AGENTSTACK_REGISTRY_WINDOW_HOURS ?? 24) * 60 * 60 * 1000;

interface RegistryEntry {
  server: {
    name: string;
    title?: string;
    description?: string;
    version?: string;
    websiteUrl?: string;
    repository?: { url?: string };
    remotes?: unknown[];
    packages?: unknown[];
  };
  _meta?: {
    "io.modelcontextprotocol.registry/official"?: {
      status?: string;
      updatedAt?: string;
      isLatest?: boolean;
    };
  };
}

interface RegistryPage {
  servers: RegistryEntry[];
  metadata?: { nextCursor?: string };
}

export async function collectMcpRegistry(
  cursor: { updatedSince: string } | undefined,
): Promise<AdapterResult<{ updatedSince: string }>> {
  const updatedSince = cursor?.updatedSince ?? new Date(Date.now() - INITIAL_WINDOW_MS).toISOString();
  const fetchedAt = new Date().toISOString();

  // The same server appears once per version — keep only the latest per name.
  const byName = new Map<string, { entry: RegistryEntry; updatedAt: string }>();
  let pageCursor: string | undefined;
  let maxUpdatedAt = updatedSince;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${BASE}/v0/servers`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("updated_since", updatedSince);
    if (pageCursor) url.searchParams.set("cursor", pageCursor);

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`MCP registry HTTP ${res.status}`);
    const data = (await res.json()) as RegistryPage;

    for (const entry of data.servers ?? []) {
      const meta = entry._meta?.["io.modelcontextprotocol.registry/official"];
      if (meta?.isLatest === false) continue;
      const updatedAt = meta?.updatedAt ?? fetchedAt;
      if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
      const existing = byName.get(entry.server.name);
      if (!existing || updatedAt > existing.updatedAt) {
        byName.set(entry.server.name, { entry, updatedAt });
      }
    }

    pageCursor = data.metadata?.nextCursor;
    if (!pageCursor || (data.servers ?? []).length === 0) break;
  }

  const candidates: RawCandidate[] = [...byName.values()].map(({ entry }) => {
    const s = entry.server;
    const bodyParts = [
      s.description ?? "",
      s.version ? `Version: ${s.version}` : "",
      s.remotes ? `Remotes: ${JSON.stringify(s.remotes)}` : "",
      s.packages ? `Packages: ${JSON.stringify(s.packages)}` : "",
    ].filter(Boolean);
    return {
      source: "mcp-registry" as const,
      externalId: s.name,
      title: s.title ?? s.name,
      body: bodyParts.join("\n").slice(0, 6000),
      url: s.websiteUrl ?? s.repository?.url ?? `${BASE}/v0/servers?search=${encodeURIComponent(s.name)}`,
      fetchedAt,
    };
  });

  return { candidates, nextCursor: { updatedSince: maxUpdatedAt } };
}
