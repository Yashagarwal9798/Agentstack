# context.md — build memory

*One section per completed phase, newest first. Read this before writing any code in a new session. Structure per CLAUDE.md: what was built, files, verification output, deviations, gotchas.*

---

## Phase 4 — Pipeline LLM stages + catalog releases ✅ (2026-07-17)

**What was built**
- `shared/src/llm.ts` — generic `chat`/`chatJson(prompt, schema, settings)` moved here (pipeline + cli both need it; **deviation** from architecture.md which placed it in cli only — cli/core/llm.ts is now a thin config-bound wrapper). Retry-After-aware backoff (6 attempts) on 429/5xx.
- `pipeline/src/process/enrich.ts` — registry/skills candidates: deterministic skeleton (id, install command/mcpConfig from registry packages/remotes, trust tier, secrets) + batched LLM judgment fields (10/call, 30s pacing). `sourceHash` computed per candidate.
- `pipeline/src/process/rss.ts` — classify (15/batch, confidence gates ≥.8/.5) → URL verify → single-item full extraction; held items → review.log; RSS-discovered cards always `trust: community`.
- `pipeline/src/canonical.ts` — contentHash versioning (volatile fields excluded), multi-source merge, firstSeen preserved on update.
- `pipeline/src/release.ts` — immutable delta + catalog.json rewrite + manifest append (sha256); validates catalog before write; returns null when nothing changed.
- `pipeline/src/run.ts` — orchestrator: collect → enqueue(pending) → bounded batch (`AGENTSTACK_PIPELINE_MAX`=120) → route by source → canonicalize → release → persist queue+cursors LAST. Batch failures requeue.
- `.github/workflows/discover.yml` — daily cron 03:30 UTC + dispatch; commits catalog/; needs secrets `AGENTSTACK_LLM_*`.
- `scripts/validate-catalog.ts` — full catalog schema + manifest checksum sweep.

**Verification:** 3 real releases (2026.07.16.1 +120 / .2 +30 / .3 +8~2) = **158 cards**; `validate-catalog.ts` → 158/158 valid, all sha256 ok; no-release path exercised. Actions green check deferred to Phase 10.

**Deviations:** LLM client lives in shared (see above). Registry initial window 7d→24h (env `AGENTSTACK_REGISTRY_WINDOW_HOURS`). Backfill cut at 158 cards (user decision — time), 6 items left queued for the cron.

**Gotchas**
- llama-3.3 via Groq returns **bare JSON arrays** despite instructions — schemas use `z.preprocess` to wrap; prompts say `{"items": [...]}` explicitly.
- Groq free tier: 12k TPM / ~1000 req/hr observed in headers; sustained batching needs the 30s pacing; a wedged run (alive, zero CPU, 38 min silent) had to be killed — suspect stacked Retry-After waits; watch for it in Actions (job timeout recommended).
- Registry activity is high (~16 new entries/hour observed!) — the daily cron will always have material.
- PowerShell `| Select-Object -Last N` buffers ALL output — background runs look silent until exit; don't diagnose by empty output file.

---

## Phase 3 — Pipeline source adapters + cursors ✅ (2026-07-17)

**What was built**
- `pipeline/src/types.ts` — `RawCandidate {source, externalId, title, body, url, fetchedAt}`, `Cursors`, `AdapterResult` (adapter returns *staged* cursor; caller decides when to persist).
- `pipeline/src/cursors.ts` — `catalog/state/cursors.json` load/save (atomic; state lives in git, no server).
- `sources/mcpRegistry.ts` — `registry.modelcontextprotocol.io/v0/servers` with `updated_since` + `cursor` pagination (100/page, 10-page cap). **First run bounded to a 7-day window** (else it pages the whole registry). Skips `isLatest: false`, dedupes multi-version entries by name keeping newest. Cursor = max `updatedAt` seen.
- `sources/skillsRepo.ts` — `anthropics/skills`: HEAD SHA via commits API; same SHA → 0 candidates; incremental via compare API (changed SKILL.md only, removed excluded); first run via recursive tree. Content from raw.githubusercontent (not API-rate-limited). `template/SKILL.md` excluded. `GITHUB_TOKEN` used if set.
- `sources/rss.ts` — `hnrss.org/newest?q=MCP&count=30`, fast-xml-parser, GUID-set cursor (capped 500), HTML stripped, **3-attempt retry on non-OK** (hnrss threw real 502s twice today).
- `collect.ts` — `collectAll(cursors)` with `Promise.allSettled`: failures isolated per source, cursor advances only for fulfilled sources. Standalone runner (`npm run pipeline:collect`) prints per-source counts, writes `catalog/state/candidates.json` (gitignored, debug), persists cursors, exits 1 only if ALL sources fail.

**Verification (Done-when):** run 1 → 670 candidates (623 registry / 17 skills / 30 rss). Run 3 → 0/0/0 (run 2 caught 3 registry entries published *between runs* — live ecosystem). Failure isolation: sabotaged feed URL → `rss FAILED`, others advanced (2/3), exit 0, rss cursor preserved; restored URL → healthy.

**Registry response shape (probed live):** `{servers: [{server: {name, title, description, version, websiteUrl, repository, remotes, packages}, _meta: {"io.modelcontextprotocol.registry/official": {status, updatedAt, isLatest}}}], metadata: {nextCursor, count}}`.

**Gotchas for Phase 4**
- 623 registry candidates in a 7-day window ⇒ classification volume is real. Free-tier Gemini rate limits (~10-15 RPM flash) make classifying ALL of them slow — Phase 4 should batch candidates per LLM call and/or cap per-run volume, and consider pre-filtering registry entries (they're already known-MCPs; classification is mainly for RSS noise).
- `git checkout --` does NOT revert never-committed files — my sabotage revert failed silently (fixed by editing back). Don't "revert" untracked files with git.
- Registry `updated_since` may be inclusive at the boundary; harmless (dedupe by name + customId upsert downstream).

---

## Phase 2 — Core local infrastructure ✅ (2026-07-17)

**What was built**
- `cli/src/core/stateStore.ts` — `~/.agentstack/` JSON state: `paths` map (config/catalog/releases/projects/feedback/installs per slug), `readJson`/`writeJson` (atomic tmp+rename), `loadConfig`/`saveConfig`, `resolveSupermemoryKey` + `resolveLlm` (env > config precedence: `SUPERMEMORY_API_KEY`, `AGENTSTACK_LLM_BASE_URL/MODEL/API_KEY`, fallback `GEMINI_API_KEY`), `loadLocalCatalog`/`saveLocalCatalog`, `loadFeedback`/`appendFeedback`. Defaults: Gemini OpenAI-compat baseURL + `gemini-flash-latest`.
- `cli/src/core/memory.ts` — `Memory` class pinned to `http://localhost:6767`: `health()`, `upsertCard()` (narrative via `cardToNarrative`, `customId = toCustomId(id)`, **metadata carries capabilityId/type/status/trust/localCloud**), `addProjectMemory`, `addExperience` (metadata.projectSlug), `searchCatalog/Experience/Project` → normalized `SearchHit {id, memory, similarity, capabilityId, metadata}`. `CONTAINERS = catalog / project_<slug> / experience`.
- `cli/src/core/llm.ts` — provider-agnostic OpenAI-compat client: `complete()` and `completeJson(prompt, zodSchema)` with fence-stripping, one schema-repair retry, and **backoff retries (4 attempts, 5s·2ⁿ) on 429/5xx** (Gemini threw a real 503 during smoke).
- `cli/src/index.ts` re-exports all three; `scripts/smoke-phase2.ts` wired as `npm run smoke:phase2`.

**Verification:** `npm run smoke:phase2` → PASS: health ✔; 15 cards upserted twice ✔; semantic search "debug my web frontend in a real browser" returned playwright-mcp + webapp-testing + frontend-design ✔; no duplicated memory texts after double import ✔; `completeJson` → schema-valid `{language: "TypeScript"}` ✔.

**Deviations:** zod pinned to ^3.25 in cli (npm auto-picked v4 which conflicts with shared; required deleting package-lock + full reinstall to dedupe).

**Gotchas for later phases**
- **customId rules (server v0.0.5):** only `[a-zA-Z0-9_:-]` — colons ALLOWED, dots/slashes NOT (contradicts SDK docs). `toCustomId()` replaces illegal chars with `_`.
- **One card ⇒ MULTIPLE atomic memories.** The server splits/rewrites each document via LLM extraction. Search hits are chunks; **group by `metadata.capabilityId`, never assume 1 hit = 1 card**. Duplicate capabilityIds across hits are normal; duplicated *identical memory text* would indicate a real dupe.
- **Indexing is slow + async:** 15 cards took ~4 min to fully index on first import (2 concurrent ingest workers, Gemini extraction per doc). `update` digests must not promise instant searchability; smoke/tests need generous polling.
- **Supermemory's own Gemini usage shares the user's key/quota** — concurrent extraction can trigger 429/503 on our CLI calls; llm.ts retries handle it.
- Node's `process.loadEnvFile(path)` works for `.env.local` in scripts (no dotenv dep needed).

---

## Phase 1 — Monorepo scaffold + shared schemas + starter content ✅ (2026-07-17)

**What was built**
- npm-workspaces monorepo: `shared/` (`@agentstack/shared`), `cli/` (`@agentstack/cli`, bin `agentstack`), `pipeline/` (`@agentstack/pipeline`). ESM (`"type": "module"`), TypeScript strict, NodeNext resolution, project references (`tsc -b cli pipeline` builds shared transitively).
- `shared/src/schema.ts`: all zod schemas + inferred types — `CapabilityCard` (+ `CapabilityId` regex `type:namespace/name`, enums for type/status/trust/localCloud/sourceKind), `Manifest`, `Delta` (full cards for added/updated, bare ids for deprecated), `Catalog`, `ProjectProfile` (+ constraints, `InstalledCapability`), `Recommendation` (+ `RecommendedItem.memoryInfluence`, `RejectedItem.stage`), `StackLock`, `FeedbackRecord`.
- `starter/catalog.json`: **15 capability cards** — 3 bundled agentstack skills, 2 anthropics skills (frontend-design, webapp-testing), 10 MCPs (filesystem, memory, sequential-thinking, github, playwright, context7, exa, firecrawl, supabase, and a **deprecated** postgres reference card for demo purposes). Mix of local/cloud/hybrid and trust tiers is deliberate — gives `recommend` real material for privacy gating and trust penalties.
- `starter/skills/{project-planning,root-cause-debugging,verification-before-completion}/SKILL.md`: full skill content with frontmatter.
- `scripts/validate-starter.ts` wired as `npm run validate:starter` (build + schema-validate every card + duplicate-id check).

**Files:** root `package.json`/`tsconfig.base.json`/`.gitignore`, per-package `package.json`+`tsconfig.json`, `shared/src/{schema,index}.ts`, placeholder `cli/src/index.ts` + `pipeline/src/index.ts`, `starter/**`, `scripts/validate-starter.ts`.

**Verification (Done-when):** `npm run validate:starter` → build green, `15/15 cards valid`, exit 0. Git history: 2 commits (`docs: …`, `phase 1: …`).

**Deviations**
- Phase plan said "~10–15 cards" → shipped 15.
- git repo initialized now (phase.md allowed now or Phase 10).

**Gotchas for later phases**
- Node here is **v22.16.0** (some tools want ≥22.20 — the `skills` installer warned; nothing broke).
- Starter cards' install commands/URLs are from model knowledge — treated as bootstrap data; first real `update` (Phase 4/5) reconciles them. Bundled-skill cards use placeholder source URL `github.com/agentstack/agentstack-radar` — **fix when the public repo is created** (in todo.md).
- Workspace imports resolve to `dist/` via package `exports` — run `npm run build` before `tsx` scripts that import `@agentstack/shared`.
- Git warns LF→CRLF on Windows; harmless, ignore.

---

## Phase 0 — Supermemory Local ground truth ⏸ PARTIAL (2026-07-17)

**Status: paused waiting for user's LLM API key.** Full detail in [docs/phase0-findings.md](docs/phase0-findings.md).

**Key facts**
- `npx supermemory local` on Windows installs and runs the **Linux binary inside WSL** (user `yash`): binary `/home/yash/.supermemory/bin/supermemory-server`, provider env file `/home/yash/.supermemory/env`, version **0.0.5**, sha256-verified.
- First-run setup **requires an LLM API key** (OpenAI/Anthropic/Gemini) for embeddings/summaries before the server starts. Interactive prompt — killed the process; will configure non-interactively by appending to the WSL env file.
- User has **no API key yet**; recommended free Gemini key → they'll put it in `.env.local` (gitignored) as `GEMINI_API_KEY=…`.

**Remaining (blocks Phase 2, not Phase 1):** append key to WSL env → start server (background) → capture `sm_` key + URL → verify reachable from Windows → SDK round-trip (add → differently-worded search) → customId double-add upsert test → finish findings doc.
