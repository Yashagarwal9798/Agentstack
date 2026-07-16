import { XMLParser } from "fast-xml-parser";
import type { AdapterResult, RawCandidate } from "../types.js";

export const FEED_URL = "https://hnrss.org/newest?q=MCP&count=30";
const MAX_SEEN_GUIDS = 500;

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  guid?: string | { "#text"?: string };
}

function guidOf(item: RssItem): string {
  if (typeof item.guid === "string") return item.guid;
  return item.guid?.["#text"] ?? item.link ?? item.title ?? "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function collectRss(
  cursor: { seenGuids: string[] } | undefined,
): Promise<AdapterResult<{ seenGuids: string[] }>> {
  // hnrss.org throws transient 502s (seen twice on 2026-07-17) — retry before failing.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 4000 * attempt));
    res = await fetch(FEED_URL, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) break;
  }
  if (!res?.ok) throw new Error(`RSS feed HTTP ${res?.status}`);
  const xml = await res.text();

  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } };
  };
  const rawItems = parsed.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const seen = new Set(cursor?.seenGuids ?? []);
  const fetchedAt = new Date().toISOString();
  const candidates: RawCandidate[] = [];

  for (const item of items) {
    const guid = guidOf(item);
    if (!guid || seen.has(guid)) continue;
    candidates.push({
      source: "rss",
      externalId: guid,
      title: item.title ?? "(untitled)",
      body: stripHtml(item.description ?? "").slice(0, 4000),
      url: item.link ?? guid,
      fetchedAt,
    });
  }

  const seenGuids = [...(cursor?.seenGuids ?? []), ...candidates.map((c) => c.externalId)].slice(-MAX_SEEN_GUIDS);
  return { candidates, nextCursor: { seenGuids } };
}
