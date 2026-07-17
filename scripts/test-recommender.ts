// Phase 7 done-when: unit-test the deterministic ranking stages with fixture
// cards — gates and scoring are pure functions, no LLM, no network.
import assert from "node:assert/strict";
import type { CapabilityCard, FeedbackRecord, ProjectProfile } from "@agentstack/shared";
import { applyFeedback, baseScore, buildQuery, hardGates, similarityByCard } from "@agentstack/cli";

const card = (over: Partial<CapabilityCard>): CapabilityCard => ({
  id: "mcp:test/fixture",
  name: "Fixture",
  type: "mcp",
  summary: "A test capability.",
  useWhen: ["testing"],
  doNotUseWhen: [],
  categories: ["testing"],
  agents: ["claude-code"],
  languages: [],
  permissions: [],
  installation: { requiredSecrets: [] },
  localCloud: "local",
  version: "1.0.0",
  status: "active",
  trust: "curated",
  sources: [{ url: "https://example.com", kind: "registry" }],
  firstSeen: "2026-07-17",
  lastChecked: new Date().toISOString().slice(0, 10),
  ...over,
});

const profile: ProjectProfile = {
  slug: "test-project",
  goal: "A privacy-first local PDF chat app",
  stack: ["typescript", "electron"],
  constraints: [{ type: "privacy", text: "No cloud processing" }],
  stage: "early",
  alreadyInstalled: [{ id: "mcp:microsoft/playwright-mcp", installedAs: "mcp-config", detectedFrom: ".mcp.json" }],
  targetAgent: "claude-code",
  createdAt: "2026-07-17",
  updatedAt: "2026-07-17",
};

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`✔ ${name}`);
};

test("buildQuery contains goal, stack and constraints", () => {
  const q = buildQuery(profile);
  assert.match(q, /PDF chat/i);
  assert.match(q, /typescript/i);
  assert.match(q, /No cloud processing/);
});

test("similarityByCard keeps the best chunk per capability", () => {
  const sim = similarityByCard([
    { id: "a", memory: "", similarity: 0.5, capabilityId: "mcp:x/y", metadata: null },
    { id: "b", memory: "", similarity: 0.8, capabilityId: "mcp:x/y", metadata: null },
    { id: "c", memory: "", similarity: 0.6, capabilityId: undefined, metadata: null },
  ]);
  assert.equal(sim.get("mcp:x/y"), 0.8);
  assert.equal(sim.size, 1);
});

test("gates: deprecated, cloud-vs-privacy, unverified, installed, wrong agent all rejected with reasons", () => {
  const cards = [
    card({ id: "mcp:a/deprecated", status: "deprecated" }),
    card({ id: "mcp:b/cloudy", localCloud: "cloud" }),
    card({ id: "mcp:c/unverified", trust: "unverified" }),
    card({ id: "mcp:microsoft/playwright-mcp" }),
    card({ id: "mcp:d/wrong-agent", agents: ["cursor"] }),
    card({ id: "mcp:e/good" }),
  ];
  const { passed: ok, rejected } = hardGates(cards, profile);
  assert.deepEqual(ok.map((c) => c.id), ["mcp:e/good"]);
  assert.equal(rejected.length, 5);
  for (const r of rejected) {
    assert.equal(r.stage, "gate");
    assert.ok(r.reason.length > 5, `reason present for ${r.id}`);
  }
  assert.match(rejected.find((r) => r.id === "mcp:b/cloudy")!.reason, /local-only/);
  assert.match(rejected.find((r) => r.id === "mcp:microsoft/playwright-mcp")!.reason, /already installed/);
});

test("gates: cloud allowed when no privacy constraint", () => {
  const noPrivacy = { ...profile, constraints: [] };
  const { passed: ok } = hardGates([card({ id: "mcp:b/cloudy", localCloud: "cloud" })], noPrivacy);
  assert.equal(ok.length, 1);
});

test("score: in 0-100, local beats cloud-ish under privacy, official beats community", () => {
  const local = baseScore(card({ trust: "official", localCloud: "local" }), profile, 0.7);
  const hybrid = baseScore(card({ trust: "official", localCloud: "hybrid" }), profile, 0.7);
  const community = baseScore(card({ trust: "community", localCloud: "local" }), profile, 0.7);
  for (const s of [local, hybrid, community]) assert.ok(s.score > 0 && s.score <= 100, `score ${s.score} in range`);
  assert.ok(local.score > hybrid.score, "local > hybrid under privacy constraint");
  assert.ok(local.score > community.score, "official > community");
});

test("score: stack language match beats mismatch", () => {
  const match = baseScore(card({ languages: ["typescript"] }), profile, 0.6);
  const mismatch = baseScore(card({ languages: ["php"] }), profile, 0.6);
  assert.ok(match.score > mismatch.score);
  assert.ok(match.notes.some((n) => n.includes("matches stack")));
});

test("path 1: not_useful feedback demotes below an otherwise weaker card", () => {
  const feedback: FeedbackRecord[] = [
    { capabilityId: "mcp:strong/tool", projectSlug: "old-project", verdict: "not_useful", note: "too noisy", date: "2026-07-01" },
  ];
  const strong = applyFeedback(baseScore(card({ id: "mcp:strong/tool", trust: "official" }), profile, 0.8), feedback);
  const weaker = applyFeedback(baseScore(card({ id: "mcp:weak/tool", trust: "community" }), profile, 0.7), feedback);
  assert.ok(strong.score < weaker.score, `demoted ${strong.score} < ${weaker.score}`);
  assert.ok(strong.notes.some((n) => n.includes("not useful") && n.includes("old-project")));
});

test("path 1: useful feedback boosts", () => {
  const feedback: FeedbackRecord[] = [
    { capabilityId: "mcp:test/fixture", projectSlug: "old-project", verdict: "useful", date: "2026-07-01" },
  ];
  const base = baseScore(card({}), profile, 0.6);
  const boosted = applyFeedback(base, feedback);
  assert.equal(boosted.score, Math.min(100, base.score + 8));
});

console.log(`\n${passed}/8 recommender unit tests passed`);
