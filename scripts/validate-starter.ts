// Phase 1 done-when check: every starter card must pass the shared schema.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Catalog, CapabilityCard } from "@agentstack/shared";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = JSON.parse(readFileSync(join(root, "starter", "catalog.json"), "utf8"));

const catalog = Catalog.safeParse(raw);
if (!catalog.success) {
  console.error("✖ starter/catalog.json failed Catalog schema:");
  console.error(catalog.error.format());
  process.exit(1);
}

let failed = 0;
for (const card of raw.capabilities) {
  const result = CapabilityCard.safeParse(card);
  if (result.success) {
    console.log(`✔ ${card.id}`);
  } else {
    failed++;
    console.error(`✖ ${card.id ?? "<missing id>"}`);
    for (const issue of result.error.issues) {
      console.error(`    ${issue.path.join(".")}: ${issue.message}`);
    }
  }
}

const ids = new Set(raw.capabilities.map((c: { id: string }) => c.id));
if (ids.size !== raw.capabilities.length) {
  console.error("✖ duplicate capability ids detected");
  failed++;
}

console.log(`\n${raw.capabilities.length - failed}/${raw.capabilities.length} cards valid`);
process.exit(failed === 0 ? 0 : 1);
