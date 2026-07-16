# context.md — build memory

*One section per completed phase, newest first. Read this before writing any code in a new session. Structure per CLAUDE.md: what was built, files, verification output, deviations, gotchas.*

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
