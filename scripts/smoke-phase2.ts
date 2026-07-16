// Phase 2 done-when check (phase.md): starter import via upsertCard is
// idempotent, semantic search returns a sensible card, llm returns schema-valid JSON.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import { Catalog } from "@agentstack/shared";
import { Memory, completeJson, resolveSupermemoryKey } from "@agentstack/cli";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envFile = join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fail = (msg: string): never => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

// --- 1. health --------------------------------------------------------------
const smKey = resolveSupermemoryKey() ?? fail("SUPERMEMORY_API_KEY not set (check .env.local)");
const memory = new Memory(smKey);
if (!(await memory.health())) fail("Supermemory Local not reachable at :6767 — is the WSL server running?");
console.log("✔ health: Supermemory Local reachable");

// --- 2. starter import (twice — idempotency) --------------------------------
const starter = Catalog.parse(JSON.parse(readFileSync(join(root, "starter", "catalog.json"), "utf8")));
for (const round of [1, 2]) {
  for (const card of starter.capabilities) await memory.upsertCard(card);
  console.log(`✔ upserted ${starter.capabilities.length} cards (round ${round})`);
}

// --- 3. semantic search + duplicate check ------------------------------------
// The server splits each card into several atomic memories and indexes them
// asynchronously (phase 0 finding) — wait until results span ≥5 distinct cards.
console.log("  waiting for async indexing (server extracts memories via LLM)…");
let hits: Awaited<ReturnType<typeof memory.searchCatalog>> = [];
for (let i = 0; i < 45; i++) {
  await sleep(10_000);
  hits = await memory.searchCatalog("I need to debug my web frontend in a real browser", 20);
  const distinct = new Set(hits.map((h) => h.capabilityId).filter(Boolean));
  console.log(`    attempt ${i + 1}: ${hits.length} hits across ${distinct.size} distinct cards`);
  if (distinct.size >= 5) break;
}
const distinctIds = [...new Set(hits.map((h) => h.capabilityId).filter(Boolean))] as string[];
if (distinctIds.length === 0) fail("catalog search returned nothing after waiting");
console.log(`✔ search returned ${hits.length} hits across ${distinctIds.length} cards; distinct ids:`);
for (const id of distinctIds) console.log(`    ${id}`);

if (!distinctIds.some((id) => id.includes("playwright") || id.includes("frontend") || id.includes("webapp"))) {
  fail(`expected a browser/frontend capability among results, got: ${distinctIds.join(", ")}`);
}
console.log("✔ a browser/frontend capability matched semantically");

// Idempotency: chunks from one card are fine; the SAME text appearing twice
// (different memory ids) would mean the double import duplicated documents.
const textSeen = new Map<string, string>();
for (const h of hits) {
  const key = `${h.capabilityId}::${h.memory}`;
  const prev = textSeen.get(key);
  if (prev !== undefined && prev !== h.id) {
    fail(`duplicate memory text after double import (card ${h.capabilityId}): "${h.memory.slice(0, 80)}…"`);
  }
  textSeen.set(key, h.id);
}
console.log("✔ no duplicated memory texts after importing twice (customId upsert is idempotent)");

// --- 4. LLM json mode ---------------------------------------------------------
const Answer = z.object({ language: z.string(), reason: z.string() });
const answer = await completeJson(
  "Which programming language is this project written in, given it uses tsconfig.json and zod? Answer with fields `language` and `reason`.",
  Answer,
);
if (!/typescript/i.test(answer.language)) fail(`LLM json answer unexpected: ${JSON.stringify(answer)}`);
console.log(`✔ completeJson: schema-valid answer (${answer.language})`);

console.log("\nPHASE 2 SMOKE: PASS");
