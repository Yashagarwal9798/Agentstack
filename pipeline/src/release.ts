// Immutable catalog releases: catalog.json (full), deltas/<version>.json,
// manifest.json with sha256 checksums. No changes ⇒ no release.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Catalog, Manifest, type CapabilityCard, type Delta } from "@agentstack/shared";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const CATALOG_DIR = join(repoRoot, "catalog");
const CATALOG_PATH = join(CATALOG_DIR, "catalog.json");
const MANIFEST_PATH = join(CATALOG_DIR, "manifest.json");
const DELTAS_DIR = join(CATALOG_DIR, "deltas");

export function loadCatalog(): Catalog {
  if (!existsSync(CATALOG_PATH)) return { version: "none", updatedAt: "", capabilities: [] };
  return Catalog.parse(JSON.parse(readFileSync(CATALOG_PATH, "utf8")));
}

export function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { latestVersion: "none", releases: [] };
  return Manifest.parse(JSON.parse(readFileSync(MANIFEST_PATH, "utf8")));
}

function nextVersion(manifest: Manifest, now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, ".");
  const todayCount = manifest.releases.filter((r) => r.version.startsWith(day)).length;
  return `${day}.${todayCount + 1}`;
}

export interface ReleaseResult {
  version: string;
  addedCount: number;
  updatedCount: number;
  deprecatedCount: number;
}

/** Writes delta + catalog + manifest. Returns null when there is nothing to release. */
export function publishRelease(
  capabilities: CapabilityCard[],
  added: CapabilityCard[],
  updated: CapabilityCard[],
  deprecated: string[],
): ReleaseResult | null {
  if (added.length === 0 && updated.length === 0 && deprecated.length === 0) return null;

  const manifest = loadManifest();
  const now = new Date();
  const version = nextVersion(manifest, now);

  const delta: Delta = {
    version,
    createdAt: now.toISOString(),
    added,
    updated,
    deprecated,
  };
  const deltaJson = JSON.stringify(delta, null, 2) + "\n";
  const sha256 = createHash("sha256").update(deltaJson).digest("hex");

  // Validate everything we publish (defense before the wire).
  Catalog.parse({ version, updatedAt: now.toISOString(), capabilities });

  // Atomic writes (tmp + rename): a crash mid-write must not leave a corrupt
  // or inconsistent catalog state that a later run would commit.
  const writeAtomic = (path: string, content: string) => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, path);
  };
  mkdirSync(DELTAS_DIR, { recursive: true });
  writeAtomic(join(DELTAS_DIR, `${version}.json`), deltaJson);
  writeAtomic(CATALOG_PATH, JSON.stringify({ version, updatedAt: now.toISOString(), capabilities }, null, 2) + "\n");
  manifest.releases.push({
    version,
    deltaPath: `catalog/deltas/${version}.json`,
    sha256,
    createdAt: now.toISOString(),
  });
  manifest.latestVersion = version;
  writeAtomic(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  return { version, addedCount: added.length, updatedCount: updated.length, deprecatedCount: deprecated.length };
}
