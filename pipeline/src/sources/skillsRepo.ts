import type { AdapterResult, RawCandidate } from "../types.js";

export const SKILLS_REPO = "anthropics/skills";
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function isSkillFile(path: string): boolean {
  // template/SKILL.md is the authoring template, not a real skill
  return path.endsWith("SKILL.md") && !path.startsWith("template");
}

export async function collectSkillsRepo(
  cursor: { sha: string } | undefined,
): Promise<AdapterResult<{ sha: string }>> {
  const commits = await ghJson<Array<{ sha: string }>>(`${API}/repos/${SKILLS_REPO}/commits?per_page=1`);
  const headSha = commits[0]?.sha;
  if (!headSha) throw new Error("could not resolve HEAD sha");

  if (cursor?.sha === headSha) {
    return { candidates: [], nextCursor: { sha: headSha } };
  }

  let paths: string[];
  if (cursor?.sha) {
    // Incremental: only SKILL.md files changed between the two commits.
    const diff = await ghJson<{ files?: Array<{ filename: string; status: string }> }>(
      `${API}/repos/${SKILLS_REPO}/compare/${cursor.sha}...${headSha}`,
    );
    paths = (diff.files ?? [])
      .filter((f) => isSkillFile(f.filename) && f.status !== "removed")
      .map((f) => f.filename);
  } else {
    // First run: every SKILL.md in the tree.
    const tree = await ghJson<{ tree: Array<{ path: string; type: string }> }>(
      `${API}/repos/${SKILLS_REPO}/git/trees/${headSha}?recursive=1`,
    );
    paths = tree.tree.filter((t) => t.type === "blob" && isSkillFile(t.path)).map((t) => t.path);
  }

  const fetchedAt = new Date().toISOString();
  const candidates: RawCandidate[] = [];
  for (const path of paths) {
    const res = await fetch(`${RAW}/${SKILLS_REPO}/${headSha}/${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`raw fetch HTTP ${res.status} for ${path}`);
    const content = await res.text();
    const dir = path.split("/").slice(0, -1).pop() ?? path;
    candidates.push({
      source: "skills-repo",
      externalId: path,
      title: dir,
      body: content.slice(0, 8000),
      url: `https://github.com/${SKILLS_REPO}/blob/main/${path}`,
      fetchedAt,
    });
  }

  return { candidates, nextCursor: { sha: headSha } };
}
