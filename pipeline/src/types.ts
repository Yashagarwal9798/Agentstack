export type SourceName = "mcp-registry" | "skills-repo" | "rss";

/** One raw item collected from a source, before classification (phase 4). */
export interface RawCandidate {
  source: SourceName;
  /** Stable id within the source: registry server name, repo file path, RSS guid. */
  externalId: string;
  title: string;
  body: string;
  url: string;
  fetchedAt: string;
}

export interface Cursors {
  mcpRegistry?: { updatedSince: string };
  skillsRepo?: { sha: string };
  rss?: { seenGuids: string[] };
}

export interface AdapterResult<C> {
  candidates: RawCandidate[];
  /** Staged cursor — the runner persists it only when this source succeeded. */
  nextCursor: C;
}
