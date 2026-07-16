// Phase 4 done-when check: every published card passes the shared schema, and
// the manifest's checksums match the delta files on disk.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Catalog, CapabilityCard, Delta, Manifest } from "@agentstack/shared";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogDir = join(root, "catalog");

const catalog = Catalog.parse(JSON.parse(readFileSync(join(catalogDir, "catalog.json"), "utf8")));
let bad = 0;
for (const card of catalog.capabilities) {
  const res = CapabilityCard.safeParse(card);
  if (!res.success) {
    bad++;
    console.error(`✖ ${card.id}: ${res.error.issues[0]?.path.join(".")} — ${res.error.issues[0]?.message}`);
  }
}
const ids = new Set(catalog.capabilities.map((c) => c.id));
if (ids.size !== catalog.capabilities.length) {
  bad++;
  console.error("✖ duplicate ids in catalog");
}
console.log(`catalog.json: ${catalog.capabilities.length - bad}/${catalog.capabilities.length} cards valid (version ${catalog.version})`);

const manifest = Manifest.parse(JSON.parse(readFileSync(join(catalogDir, "manifest.json"), "utf8")));
for (const release of manifest.releases) {
  const raw = readFileSync(join(root, release.deltaPath), "utf8");
  const sha = createHash("sha256").update(raw).digest("hex");
  const delta = Delta.safeParse(JSON.parse(raw));
  const shaOk = sha === release.sha256;
  const schemaOk = delta.success;
  if (!shaOk || !schemaOk) bad++;
  console.log(`${shaOk && schemaOk ? "✔" : "✖"} delta ${release.version}: sha256 ${shaOk ? "ok" : "MISMATCH"}, schema ${schemaOk ? "ok" : "INVALID"}`);
}
if (manifest.latestVersion !== catalog.version) {
  bad++;
  console.error(`✖ manifest.latestVersion (${manifest.latestVersion}) != catalog.version (${catalog.version})`);
}

console.log(bad === 0 ? "\nCATALOG VALIDATION: PASS" : `\nCATALOG VALIDATION: ${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
