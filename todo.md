# AgentStack Radar — TODO & Locked Decisions

## Decisions made during build

- **LLM provider: Gemini** (user's key in `.env.local`), OpenAI-compat endpoint, model `gemini-flash-latest` (`gemini-2.5-flash` is closed to new API users). Still provider-agnostic via env/config.
- **Phase 3 sources:** skills repo = `anthropics/skills`; RSS = `https://hnrss.org/newest?q=MCP&count=30` (noisy by design for the classifier; adapter retries transient 502s). Swap by editing one constant in each adapter.

## Open decisions

- [ ] **LLM provider + API key** (Gemini / OpenAI / Anthropic) — user decides at testing time. Build is provider-agnostic (OpenAI-compatible client); switching = config/env change only. **No local model (Ollama) in v1.**
- [ ] Confirm hackathon deadline/timezone + active Google Form link in latest Discord announcement.
- [ ] Demo video script — deferred until after the build (arc proposal exists in grilling transcript).
- [ ] Regenerate the 3 spec diagrams (AgentStack_Radar_assets) to match locked v1 decisions before README/Phase 10: 3 sources not 4, git-JSON catalog not Postgres, sha256 checksums not signatures, refresh folded into recommend, apply = file writes only.

## Decisions locked during grilling (2026-07-17)

1. **Memory hero:** cross-project **experience memory** (feedback, accept/reject decisions, preferences). Catalog search is supporting cast. Demo climax = recommendation in project B changes because of project A's history.
2. **Memory capture:** apply-time accept/reject decisions auto-stored with reasons; `agentstack feedback` = end-of-project review listing all installed capabilities, user marks each y/n useful.
3. **Ranking:** two-path hybrid — (a) exact-capability-ID feedback → deterministic score penalty/boost; (b) pattern-level preference memories retrieved semantically from Supermemory → LLM adjusts ranking + writes explanations.
4. **Global pipeline:** real discovery script, GitHub Actions cron (daily), publishes versioned `catalog.json` + delta files to the public GitHub repo. Raw GitHub URL = catalog release API. No hosted server, no Postgres.
5. **Sources (exactly 3):** official MCP Registry API · one curated Agent Skills GitHub repo (SKILL.md scan) · one RSS/newsletter feed (proves LLM classification over noise).
6. **Supermemory containerTags:** `catalog` (shared public capability cards) · `project_<slug>` (per-project profile/constraints/installs) · `experience` (single user-level space, all cross-project lessons, each memory names its source project).
7. **LLM setup:** cloud-only, provider-agnostic OpenAI-compatible client.
8. **Target agent:** Claude Code only, behind a small agent-adapter interface (paths, config format, instruction filename) so Cursor/Codex are honest roadmap items.
9. **`apply` scope:** file writes ONLY — copy skill folders to `.claude/skills/`, write `.mcp.json` entries, generate `CLAUDE.md`, `AI_STACK.md`, `stack.lock.json`. Never executes install commands; anything executable becomes a printed "run this yourself" checklist. `--dry-run` previews all file changes.
10. **Project profiling:** idea mode primary (guided prompts → LLM → structured profile) + automatic light scan (package.json/requirements.txt, README, existing `.claude/skills/` and `.mcp.json` to avoid duplicate recommendations). No deep source-code analysis in v1.
11. **Tech stack:** Node.js + TypeScript everywhere (CLI + pipeline share Capability Card types). JSON file state under `~/.agentstack/` — NO SQLite. CLI: commander + @clack/prompts.
12. **Command surface (8):** `init` · `update` · `discoveries` · `inspect <id>` · `project init` · `recommend` · `apply [--dry-run]` · `feedback`. Cut/folded: doctor, status, schedule, project scan/refresh, sources list. Stale-catalog nudge on any command replaces local OS scheduler.

## Assumptions to confirm before/while building

- [ ] Single public monorepo (e.g. `agentstack-radar`): `cli/` + `pipeline/` + `catalog/` (GitHub Actions commits releases into `catalog/`). One repo for judges to browse.
- [ ] Bundled starter content per spec: starter capability catalog JSON + 3 bundled core skills (Project Planning, Root-Cause Debugging, Verification Before Completion) offered at init.
- [ ] Supermemory Local runs on this Windows machine (hackathon notes say npx/Docker/WSL may be needed) — verify `npx supermemory local` FIRST, before writing integration code.

## Build tasks (once confirmed)

- [ ] Repo scaffold: monorepo, TS config, shared `CapabilityCard` schema (zod) + types
- [ ] Verify Supermemory Local starts on Windows; capture base URL + sm_ key flow
- [ ] Pipeline: source adapters ×3 (MCP Registry, skills repo, RSS)
- [ ] Pipeline: LLM classify → extract Capability Card → validate (zod) → dedupe by canonical ID → version
- [ ] Pipeline: catalog release writer (catalog.json + delta + manifest with checksums) + GitHub Actions cron workflow
- [ ] CLI `init`: detect Supermemory, provider config, import starter catalog → `catalog` container
- [ ] CLI `update`: fetch manifest/deltas from raw GitHub URL, verify checksum, upsert JSON state + Supermemory `catalog` container, print digest
- [ ] CLI `discoveries` + `inspect <id>`
- [ ] CLI `project init`: idea prompts + light auto-scan → profile → `project_<slug>` container + `~/.agentstack/projects/`
- [ ] CLI `recommend`: semantic retrieve (catalog) + project profile + experience retrieve → deterministic filters/scores → LLM rank/explain → minimal stack with rejected-alternatives output
- [ ] CLI `apply`: dry-run diff preview → approval per item → file writes (skills, .mcp.json, CLAUDE.md, AI_STACK.md, stack.lock.json) → auto-store decision memories in `experience`
- [ ] CLI `feedback`: list installed capabilities → y/n per item → store verdicts in `experience`
- [ ] Starter catalog JSON + 3 bundled core skills content
- [ ] End-to-end test of the two-project memory loop (A: feedback → B: changed recommendation)
- [ ] README with architecture, judging-criteria mapping, setup instructions
- [ ] Push to public GitHub repo with clean fresh commit history
- [ ] Demo video (script discussion pending) + Google Form + Discord showcase post
