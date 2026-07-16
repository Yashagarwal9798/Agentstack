// The §2.3 update flow: manifest → missing deltas → checksum verify → JSON
// mirror upsert → Supermemory upsert → lastSync commits LAST.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Delta, Manifest, type CapabilityCard, type CatalogRelease } from "@agentstack/shared";
import {
  loadConfig,
  saveConfig,
  loadLocalCatalog,
  saveLocalCatalog,
  paths,
  readJson,
  writeJson,
  type Config,
} from "./stateStore.js";
import type { Memory } from "./memory.js";

/** Repo root when running from the monorepo (cli/{src,dist}/core → 3 up). */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * Where catalog releases come from. Precedence: env > config > local repo
 * checkout (dev) — the GitHub raw URL becomes the default at ship time.
 */
export function resolveCatalogBase(config: Config): string {
  const fromEnv = process.env.AGENTSTACK_CATALOG_BASE;
  if (fromEnv) return fromEnv;
  if (config.catalogManifestUrl) return config.catalogManifestUrl;
  if (existsSync(join(repoRoot, "catalog", "manifest.json"))) return repoRoot;
  throw new Error("No catalog source configured. Set AGENTSTACK_CATALOG_BASE or run `agentstack init`.");
}

async function fetchText(base: string, relPath: string): Promise<string> {
  if (/^https?:\/\//.test(base)) {
    const url = `${base.replace(/\/$/, "")}/${relPath}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return await res.text();
  }
  return readFileSync(join(base, relPath), "utf8");
}

export interface AppliedRelease {
  version: string;
  appliedAt: string;
  added: string[];
  updated: string[];
  deprecated: string[];
}

export interface UpdateSummary {
  upToDate: boolean;
  fromVersion: string;
  toVersion: string;
  applied: AppliedRelease[];
  addedCount: number;
  updatedCount: number;
  deprecatedCount: number;
  /** Installed capabilities affected by this update (deprecations/updates). */
  installedAffected: string[];
}

export async function runUpdate(
  memory: Memory,
  onProgress?: (msg: string) => void,
): Promise<UpdateSummary> {
  const config = loadConfig();
  const base = resolveCatalogBase(config);
  const say = onProgress ?? (() => {});

  say("fetching manifest");
  const manifest = Manifest.parse(JSON.parse(await fetchText(base, "catalog/manifest.json")));
  const current = config.lastSync?.version;

  if (current === manifest.latestVersion) {
    return {
      upToDate: true,
      fromVersion: current ?? "none",
      toVersion: manifest.latestVersion,
      applied: [],
      addedCount: 0,
      updatedCount: 0,
      deprecatedCount: 0,
      installedAffected: [],
    };
  }

  // Ordered chain of releases we haven't applied yet.
  const currentIdx = manifest.releases.findIndex((r: CatalogRelease) => r.version === current);
  const missing = manifest.releases.slice(currentIdx + 1);

  const mirror = loadLocalCatalog();
  const byId = new Map(mirror.capabilities.map((c) => [c.id, c]));
  const applied: AppliedRelease[] = [];
  const touchedCards: CapabilityCard[] = [];

  for (const release of missing) {
    say(`verifying delta ${release.version}`);
    const raw = await fetchText(base, release.deltaPath);
    const sha = createHash("sha256").update(raw).digest("hex");
    if (sha !== release.sha256) {
      throw new Error(`checksum mismatch for ${release.version} — refusing to apply (expected ${release.sha256.slice(0, 12)}…, got ${sha.slice(0, 12)}…)`);
    }
    const delta = Delta.parse(JSON.parse(raw));

    for (const card of [...delta.added, ...delta.updated]) {
      byId.set(card.id, card);
      touchedCards.push(card);
    }
    const deprecatedHere: string[] = [];
    for (const id of delta.deprecated) {
      const existing = byId.get(id);
      if (existing && existing.status !== "deprecated") {
        const flipped = { ...existing, status: "deprecated" as const };
        byId.set(id, flipped);
        touchedCards.push(flipped);
      }
      deprecatedHere.push(id);
    }
    applied.push({
      version: delta.version,
      appliedAt: new Date().toISOString(),
      added: delta.added.map((c) => c.id),
      updated: delta.updated.map((c) => c.id),
      deprecated: deprecatedHere,
    });
  }

  say("updating local mirror");
  saveLocalCatalog({
    version: manifest.latestVersion,
    updatedAt: new Date().toISOString(),
    capabilities: [...byId.values()],
  });

  say(`writing ${touchedCards.length} cards to Supermemory`);
  let done = 0;
  for (const card of touchedCards) {
    await memory.upsertCard(card);
    done++;
    if (done % 25 === 0) say(`writing cards to Supermemory (${done}/${touchedCards.length})`);
  }

  // Idempotent history: a crash-recovery re-run must not duplicate entries.
  const appliedVersions = new Set(applied.map((a) => a.version));
  const history = readJson<AppliedRelease[]>(paths.releases, []).filter((r) => !appliedVersions.has(r.version));
  history.push(...applied);
  writeJson(paths.releases, history);

  // Which installed capabilities does this update affect?
  const affectedIds = new Set(applied.flatMap((a) => [...a.updated, ...a.deprecated]));
  const installedAffected: string[] = [];
  const projects = readJson<Record<string, string>>(paths.projects, {});
  for (const slug of Object.keys(projects)) {
    const install = readJson<{ capabilities?: Array<{ id: string }> }>(paths.install(slug), {});
    for (const cap of install.capabilities ?? []) {
      if (affectedIds.has(cap.id)) installedAffected.push(`${cap.id} (project ${slug})`);
    }
  }

  // Commit the sync version LAST — a crash before this line means the next
  // run redoes the chain, and every write above is an idempotent upsert.
  const fresh = loadConfig();
  fresh.lastSync = { version: manifest.latestVersion, date: new Date().toISOString() };
  saveConfig(fresh);

  return {
    upToDate: false,
    fromVersion: current ?? "none",
    toVersion: manifest.latestVersion,
    applied,
    addedCount: applied.reduce((n, a) => n + a.added.length, 0),
    updatedCount: applied.reduce((n, a) => n + a.updated.length, 0),
    deprecatedCount: applied.reduce((n, a) => n + a.deprecated.length, 0),
    installedAffected,
  };
}

/** One-line hint when the catalog is stale (>24h) — replaces an OS scheduler. */
export function staleness(): string | null {
  const config = loadConfig();
  if (!config.lastSync) return null;
  const ageMs = Date.now() - new Date(config.lastSync.date).getTime();
  if (ageMs < 24 * 60 * 60 * 1000) return null;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return `catalog is ${days >= 1 ? `${days}d` : "over a day"} old — run \`agentstack update\``;
}
