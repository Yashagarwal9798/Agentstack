# Phase Plan — AgentStack Radar

*Companion to [prd.md](prd.md) (what/why) and [architecture.md](architecture.md) (how). This file says **in what order**, and is the working checklist during the build.*

## How to use this file

1. **One phase at a time.** A phase is not started until the previous phase's *Done when* checks all pass. No skipping ahead, no "while I'm here" work from a later phase.
2. **Read before building.** Each phase lists the exact PRD/architecture sections that are its source of truth. If something isn't specified there, it's a decision — stop and ask, don't invent.
3. **Verify with commands, not vibes.** Every phase ends with runnable checks. A phase claiming "done" must show the check output.
4. **Update as you go.** Tick checkboxes here; log discoveries/deviations in the phase's *Notes* line; keep open decisions in [todo.md](todo.md).

**Phase dependency chain:**
`0 → 1 → 2 → {3 → 4} and {5} → 6 → 7 → 8 → 9 → 10`
(Pipeline 3–4 and CLI catalog 5 both depend on 2; 5 needs 4's output format but can build against the starter catalog + a hand-written manifest fixture before 4 is live.)

---

## Phase 0 — Ground truth: Supermemory Local on this machine

**Goal:** Prove the single hard dependency works on this Windows machine before writing any product code.
**Source of truth:** architecture.md §3 (Windows-first), hackathon.md §4 (quickstart, Windows consideration).

- [x] Start Supermemory Local (`npx supermemory local`); if native Windows fails, try WSL, then Docker — record which path works → **installer auto-ran in WSL** (linux-x64 binary, `/home/yash/.supermemory/`)
- [x] Capture: base URL responds at `http://localhost:6767`, the generated `sm_` key, where data lands (`/home/yash/.supermemory`, encrypted), what LLM-provider config it asked for (GEMINI_API_KEY)
- [x] Scratch script: add one fact with a `containerTag`, then search with *differently-worded* query → hit at similarity 0.67 (~10s, async indexing)
- [x] Test the `customId` upsert behavior → confirmed: double-add = ONE memory, no duplicates
- [x] Write findings to `docs/phase0-findings.md`: launch command, key handling, API surprises (SDK v4 surface differs from docs; server rewrites memory content; embeddings are LOCAL)

**Done when:** add → semantic search round-trip works against `localhost:6767` and findings are written down.
**Not in this phase:** any repo scaffolding, any CLI code.
**Notes:** ✅ Done 2026-07-17 (resumed after user supplied Gemini key). Server runs in WSL, reachable from Windows. Key API surprises recorded in docs/phase0-findings.md — READ IT before Phase 2 (client.add is top-level; metadata must carry capabilityId; gemini-flash-latest not 2.5-flash).

---

## Phase 1 — Monorepo scaffold + shared schemas + starter content

**Goal:** A compiling workspace where both packages share one source of type truth, and all static content exists.
**Source of truth:** architecture.md §1.2 (layout), prd.md §10 (data models), prd.md §6.4 (starter content).

- [x] Scaffold monorepo: `cli/`, `pipeline/`, `shared/`, `starter/`, `catalog/` (empty), `.github/workflows/` (empty); npm workspaces; TypeScript strict config; build scripts
- [x] `shared/src/schema.ts`: zod schemas + inferred types for `CapabilityCard`, `Manifest`, `Delta`, `ProjectProfile`, `Recommendation`, `StackLock`, `FeedbackRecord`
- [x] Author `starter/catalog.json`: 15 hand-written capability cards — every card passes the zod schema (15/15)
- [x] Author the 3 bundled core skills in `starter/skills/`: Project Planning, Root-Cause Debugging, Verification Before Completion (each a `SKILL.md`)
- [x] git init + first commits (public repo can be created now or in Phase 10 — fresh history matters, hackathon.md rule 3)

**Done when:** `npm run build` passes across the workspace; a script validates every starter card against the schema with zero errors.
**Not in this phase:** any runtime logic, network calls, LLM calls.
**Notes:** ✅ Done 2026-07-17. `npm run validate:starter` → 15/15 valid, build green. Commits `4750c7f` (docs) + `482200b` (scaffold). See context.md for gotchas (Node 22.16, dist-based workspace imports, placeholder starter source URLs).

---

## Phase 2 — Core local infrastructure (state, memory, LLM)

**Goal:** The three clients every command depends on, each proven by a smoke script.
**Source of truth:** architecture.md §1.3 (state layout), §1.4 (memory.ts, llm.ts contracts).

- [x] `cli/src/core/stateStore.ts`: read/write `~/.agentstack/` config.json, catalog.json mirror, releases.json, projects.json, installs/, feedback.json — all upsert-safe, all `path.join` (atomic tmp+rename writes)
- [x] `cli/src/core/memory.ts`: Supermemory wrapper — `health()`, `upsertCard()` (customId=id), `addProjectMemory()`, `addExperience()`, `searchCatalog()`, `searchExperience()`; baseURL hard-pinned to `http://localhost:6767`
- [x] `cli/src/core/llm.ts`: OpenAI-compatible `complete`/`completeJson(prompt, zodSchema)` with one repair retry on validation failure + backoff retries on 429/5xx; provider from env/config (baseURL, model, key — nothing else)
- [x] Smoke script: import starter catalog through `upsertCard()` twice, semantic search returns browser/frontend cards; no duplicated memory texts; `completeJson` returns schema-valid answer

**Done when:** smoke script passes; re-running it is idempotent; `llm.ts` returns schema-valid JSON from a trivial prompt (any OpenAI-compatible key).
**Not in this phase:** commands, prompts UX, ranking.
**Notes:** ✅ Done 2026-07-17. `npm run smoke:phase2` → PASS (search hit playwright/webapp-testing/frontend-design for a browser-debug query; idempotency + LLM JSON verified). Server quirks discovered: customId forbids dots but allows colons; one card ⇒ MULTIPLE atomic memories (chunks); indexing of 15 cards took ~4 min first time. See context.md.

---

## Phase 3 — Pipeline: source adapters + cursors

**Goal:** Real `RawCandidate[]` from all three sources, incrementally, with cursor state in git.
**Source of truth:** architecture.md §2.1 steps 1–2; prd.md §6.2 (sources).

- [ ] Pick the concrete skills repo + RSS feed (decision — confirm choices, record in todo.md)
- [ ] `pipeline/src/sources/mcpRegistry.ts`: paginated fetch, updated-since cursor
- [ ] `pipeline/src/sources/skillsRepo.ts`: commit-SHA compare → changed SKILL.md dirs → fetch contents
- [ ] `pipeline/src/sources/rss.ts`: feed parse, GUID/pubDate cursor
- [ ] `catalog/state/cursors.json` read/advance logic — a source's cursor advances only if that source fully succeeded; adapters fail independently
- [ ] Runner script: `npm run pipeline:collect` prints candidate counts per source; second run with no upstream changes → 0 candidates

**Done when:** first run yields real candidates from all three sources; immediate re-run yields zero (cursors work); one adapter throwing doesn't stop the others.
**Not in this phase:** LLM stages, releases, Actions.
**Notes:** —

---

## Phase 4 — Pipeline: classify → verify → extract → canonicalize → release

**Goal:** Candidates become validated, deduplicated, versioned Capability Cards published as a catalog release.
**Source of truth:** architecture.md §2.1 steps 3–8; prd.md §6.2, §10.

- [ ] `classify.ts`: cheap LLM call → zod-validated `{relevant, type, possibleName, officialUrls, confidence}`; thresholds ≥.8 auto / .5–.8 hold / <.5 drop
- [ ] `verify.ts`: HTTP-only checks — official URL resolves, install/usage instructions exist; unverifiable → `trust: "unverified"`
- [ ] `extract.ts`: evidence → `CapabilityCard` via LLM, zod parse, one repair retry; unknowns stay unknown
- [ ] `canonical.ts`: id = `type:namespace/name`; multi-source merge into one card; contentHash → new version vs lastChecked bump
- [ ] `release.ts`: write `catalog/deltas/<version>.json`, rewrite `catalog/catalog.json`, append to `manifest.json` with sha256; no changes → no release
- [ ] `.github/workflows/discover.yml`: cron (daily) + workflow_dispatch → run pipeline → commit `catalog/`
- [ ] Full local run: `npm run pipeline:run` produces a real release; re-run → no new release (idempotent)

**Done when:** a real catalog release exists in `catalog/` from real sources; re-run produces no duplicate release; every published card passes the shared schema; Actions workflow runs green via workflow_dispatch after the repo is pushed (may be re-checked in Phase 10).
**Not in this phase:** CLI consumption of the catalog.
**Notes:** —

---

## Phase 5 — CLI: init, update, discoveries, inspect

**Goal:** The catalog reaches a user's machine: bootstrap, sync, and read-only views all work.
**Source of truth:** architecture.md §2.2–§2.4; prd.md §6.1.

- [ ] CLI entry (`commander`) + shared pre-flight (Supermemory health, staleness nudge stub)
- [ ] `init`: checks → provider prompts (@clack) → write config → import starter catalog (state + Supermemory) → offer 3 core skills → run update once → health summary; re-runnable without duplication
- [ ] `update`: manifest fetch → delta chain → sha256 verify → JSON upsert → `upsertCard()` per added/updated → deprecation flips → releases.json append → lastSync commit LAST → digest print (architecture §2.3 ordering exactly)
- [ ] `discoveries` (latest release + `--since`) and `inspect <id>` (full card + provenance + installed-where)
- [ ] Staleness nudge: any command warns once when lastSync > 24h

**Done when:** on a machine-state wiped of `~/.agentstack/`: `init` → `update` → `discoveries` → `inspect <id>` all succeed against the real published catalog; killing `update` mid-run and re-running recovers cleanly.
**Not in this phase:** projects, recommendation, apply.
**Notes:** —

---

## Phase 6 — Project loop I: profile + light scan + Claude Code adapter

**Goal:** A project can describe itself; existing installs are detected so they're never re-recommended.
**Source of truth:** architecture.md §2.5, §1.4 (AgentAdapter); prd.md §6.1 (project init).

- [ ] `adapters/claudeCode.ts`: full `AgentAdapter` — paths, `renderMcpEntry()`, `detectInstalled()` (reads `.claude/skills/*` + `.mcp.json`)
- [ ] `profiler.ts`: @clack prompts (goal, stack, constraints, stage) + light scan (package.json / requirements.txt / README head / detectInstalled) → LLM → zod `ProjectProfile` → user confirms/edits
- [ ] Persist: `<project>/.agentstack/project.json` + registry entry + narrative dual-write to `project_<slug>`
- [ ] `project init` command wiring

**Done when:** running `project init` in a scratch project with a pre-seeded `.mcp.json` produces a confirmed profile whose `alreadyInstalled` lists the seeded server; profile exists in all three places (project JSON, registry, Supermemory).
**Not in this phase:** ranking, apply.
**Notes:** —

---

## Phase 7 — Project loop II: `recommend` (two-path ranking core)

**Goal:** The product's brain: minimal explained stack with rejected-alternatives, memory bending the result through both paths.
**Source of truth:** architecture.md §2.6 (all 7 stages); prd.md §7.3, §8.2.

- [ ] `recommender.ts` stage by stage: semantic retrieve → hydrate → hard gates (each with recorded reason) → base score (PRD weights) → Path 1 (feedback.json exact-id adjustments) → Path 2 (searchExperience by profile) → LLM rerank/explain
- [ ] Post-LLM validation: no new ids, no resurrection of gated items (enforced in code)
- [ ] Persist `recommendation.json` (with catalog release version); render stack + "Not selected" with reasons
- [ ] Unit-test the deterministic stages with fixture cards (gates + scoring are pure functions — test without LLM)
- [ ] Manual check of both paths: seed `feedback.json` with a "not useful" verdict → that card drops; seed an `experience` privacy memory → a cloud card is excluded/demoted with an explanation citing it

**Done when:** unit tests pass; the two seeded-memory manual checks visibly change output vs a clean run (diff the three outputs).
**Not in this phase:** file writes, decision capture.
**Notes:** —

---

## Phase 8 — Project loop III: `apply` + `feedback` (act + capture)

**Goal:** Recommendations become files; every decision and verdict becomes memory. The loop closes.
**Source of truth:** architecture.md §2.7–§2.8; prd.md §6.3, §7.2.

- [ ] `applier.ts` PLAN (pure): skill copies, `.mcp.json` merge, CLAUDE.md marked-section update, AI_STACK.md, stack.lock.json, executable-steps checklist — with risk summaries
- [ ] `--dry-run` renders the plan and stops; interactive run: per-item approve/reject → EXECUTE file writes only
- [ ] Refuse stale `recommendation.json` (catalog release moved)
- [ ] Decision capture: every accept/reject dual-written (local record + `experience` narrative with reason)
- [ ] `feedback`: list from stack.lock → y/n (+why) per item → dual-write (feedback.json + `experience`)
- [ ] Idempotency: re-running `apply` doesn't duplicate `.mcp.json` entries or CLAUDE.md sections

**Done when:** in a scratch project: dry-run shows the plan, apply writes exactly the approved files (diff-verified), lock file records versions+release, and Supermemory `experience` contains the decision + feedback narratives (verified via search).
**Not in this phase:** README, demo.
**Notes:** —

---

## Phase 9 — The hero proof: end-to-end two-project memory loop

**Goal:** Verify the judging-critical claim: project B's recommendation visibly changes because of project A — through the real commands only, nothing hand-seeded.
**Source of truth:** prd.md §3 (hero), §14 criterion 5; architecture.md §2.6.

- [ ] Clean slate: wipe `~/.agentstack/` + Supermemory data; fresh `init` + `update`
- [ ] Project A (e.g. privacy-first Electron PDF chat): `project init` → `recommend` → `apply` (reject a cloud item with a privacy reason, accept others) → `feedback` (mark one item not useful)
- [ ] Project B (different domain, *differently worded* privacy need): `project init` → `recommend`
- [ ] Assert: the not-useful capability is demoted/absent (Path 1); a cloud candidate is excluded/demoted with an explanation citing project A's experience in words that differ from the stored text (Path 2, semantic retrieval on display)
- [ ] Capture terminal output/recordings of both recommends — raw material for the demo video
- [ ] Fix whatever this exposes (prompt tuning for explanations is expected here); note fixes

**Done when:** the A→B run works from clean slate using only real commands, and the B output explicitly references A's experience. This is the demo's climax working for real.
**Not in this phase:** video editing, submission.
**Notes:** —

---

## Phase 10 — Ship: repo, README, demo, submission

**Goal:** Everything a judge touches.
**Source of truth:** hackathon.md §2 (rules, submission); prd.md §5 (judging map); todo.md open items.

- [ ] README: what/why, architecture diagram, judging-criteria mapping, honest setup guide (Supermemory Local first), demo GIF/screenshots
- [ ] Public GitHub repo live; Actions cron green on a real scheduled/dispatched run; catalog visibly updating
- [ ] Fresh-history sanity pass (hackathon rule 3) + no secrets in repo (`.env` excluded, keys only in env)
- [ ] Resolve todo.md opens: final LLM provider/key; deadline/timezone + active Google Form from Discord
- [ ] Demo video ≤3 min (script discussion pending — todo.md; Phase 9 recordings as raw material)
- [ ] Submit: Google Form + Discord showcase post (pinned template: name, one-liner, team, repo, demo, 3–5 sentences on how Supermemory Local is used)

**Done when:** form submitted, showcase posted, repo public, video linked. Shipped.
**Notes:** —
