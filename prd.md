# PRD — AgentStack Radar

*A continuously updated, project-aware capability curator for AI coding agents — built on Supermemory Local.*

**Version:** 1.0 (Hackathon build)
**Date:** 2026-07-17
**Event:** Localhost:6767 — Supermemory Local Hackathon
**Status:** Confirmed via grilling session; this document is the build source-of-truth. It supersedes `AgentStack_Radar_Markdown_Package/AgentStack_Radar_Product_Specification.md` wherever the two disagree.

---

## 1. One-liner

Paste a project idea or point at a repo. AgentStack Radar matches it against a daily-updated catalog of Agent Skills and MCP servers, recommends a minimal explained stack, installs only what you approve — and **remembers what worked across every project you build**, entirely on your machine.

## 2. Problem

The AI coding-agent ecosystem ships new MCP servers, Agent Skills, and plugins every day across registries, GitHub repos, and newsletters. A developer cannot track it all, and registries don't answer the questions that matter:

- Which of these fits *my* project, stack, and constraints?
- Which overlap, are deprecated, or violate my privacy requirements?
- Which one failed me last time — and which one actually helped?

**The gap is not tools; it's a decision layer** that turns ecosystem noise into a minimal, project-specific, experience-aware stack.

## 3. Solution overview

Two halves, deliberately split:

| Half | Runs where | Knows about | Never sees |
|---|---|---|---|
| **Global discovery pipeline** | GitHub Actions (daily cron) | Public ecosystem: registries, skill repos, RSS | User projects, preferences, feedback |
| **Local CLI + Supermemory Local** | User's machine | Private project profiles, decisions, experience | — (pulls catalog; nothing is pushed up) |

The pipeline discovers and understands each public capability **once**, publishing versioned catalog releases to a public GitHub repo. Every user's CLI pulls those deltas into Supermemory Local, where they meet the user's **private** memory: project profiles, accept/reject decisions, and end-of-project feedback. Recommendations are computed locally, explained, and applied only after dry-run approval.

### The hero feature: cross-project experience memory

The differentiator is not catalog search (any vector DB does that). It is that **recommendation N+1 is visibly smarter than recommendation 1**:

> In project A you rejected a cloud MCP for privacy and marked a skill "not useful." Weeks later in project B, AgentStack says: *"Skipping cloud-search-mcp — you've consistently avoided cloud processing. Deprioritizing X — it wasn't useful in your Electron project."*

Semantic retrieval makes this work even when the new project is described in completely different words than the stored experience — that is the Supermemory-shaped hole in this product that nothing else fills.

## 4. Target user

A developer using an AI coding agent (Claude Code in v1) who starts new projects regularly, wants the current best-fit skills/MCPs without research overhead, and does not want their project ideas, repo contents, or tool history leaving their machine.

## 5. Hackathon judging alignment

| Judging criterion | How AgentStack Radar answers it |
|---|---|
| Memory must change the outcome | Project B's recommendation differs from project A's because of stored experience |
| Local must matter | Project ideas, repo scans, decisions, and feedback never leave the machine; only public catalog data comes in |
| Retrieval should be semantic | Preference memories stored in one wording alter recommendations queried in another |
| Context needs boundaries | Three-container strategy: `catalog` / `project_<slug>` / `experience` |
| Not a generic chatbot | A CLI workflow tool with a concrete artifact output (installed stack + lock file) |
| 3-minute demo | Pipeline run → update → recommend/apply → memory-changes-the-outcome climax |

## 6. Feature set (v1)

### 6.1 CLI commands — exactly eight

| Command | What it does |
|---|---|
| `agentstack init` | Detects Supermemory Local at `http://localhost:6767`, verifies the `sm_` key, configures the LLM provider, creates `~/.agentstack/`, imports the starter catalog into Supermemory, offers 3 bundled core skills, pulls the latest catalog release. Health checks are folded in here (no separate `doctor`). |
| `agentstack update` | Fetches the latest signed manifest from the public catalog repo (raw GitHub URL), downloads missing deltas, verifies checksums, upserts JSON state + Supermemory `catalog` container, marks deprecations, prints a digest. Any other command nudges the user when the catalog is stale (replaces a local OS scheduler). |
| `agentstack discoveries` | Shows new / changed / deprecated capabilities from the latest release(s). |
| `agentstack inspect <id>` | Full Capability Card: purpose, use-when/don't-use-when, permissions, install command, version, trust tier, source provenance links. |
| `agentstack project init` | Idea mode (guided prompts: goal, stack, hard constraints) analyzed by LLM into a structured profile, plus an automatic light scan (package.json / requirements.txt, README, existing `.claude/skills/` and `.mcp.json` — so already-installed capabilities are never re-recommended). Stores profile in `project_<slug>` + `~/.agentstack/projects/`. |
| `agentstack recommend` | Builds the recommendation (see §8), prints a deliberately small stack with per-item explanations AND rejected alternatives with reasons. Re-running after an `update` covers the "project refresh" story. |
| `agentstack apply [--dry-run]` | Dry-run previews every file change; user approves per item; apply performs **file writes only** (see §6.3). Every accept/reject decision is auto-stored with its reason in `experience`. |
| `agentstack feedback` | End-of-project review: lists every capability installed in this project; user marks each y/n useful (+ optional one-line why). Verdicts stored in `experience`. |

Cut from v1 (folded or deferred): `doctor`, `status`, `schedule enable`, `project scan`, `project refresh`, `sources list`.

### 6.2 Global discovery pipeline

- **Trigger:** GitHub Actions cron, daily; also manually runnable (`workflow_dispatch` + local script run).
- **Sources — exactly three adapters:**
  1. **Official MCP Registry API** (`registry.modelcontextprotocol.io`) — structured JSON; incremental via updated-since cursor + pagination.
  2. **One curated Agent Skills GitHub repo** — scanned for `SKILL.md` directories; incremental via commit SHA comparison.
  3. **One RSS/newsletter feed** — unstructured; proves the LLM classification story; incremental via GUID/pubDate.
- **Processing:** LLM candidate classification (relevant? type? confidence?) → authoritative-source verification (official repo/registry/docs must exist; unverifiable items marked ineligible) → LLM Capability Card extraction (schema-constrained; unknown stays unknown) → zod validation with one repair retry → canonical-ID dedup (same tool from multiple sources = one capability, multiple discovery sources) → versioning (content hash change = new version; unchanged = last-seen bump).
- **Output:** an immutable catalog release committed to the repo: `catalog/catalog.json` (full), `catalog/deltas/<version>.json` (added/updated/deprecated), `catalog/manifest.json` (latest version, delta chain, sha256 checksums).
- **Failure handling:** adapters fail independently; cursors advance only on success; releases publish only after validation.

### 6.3 Safe application model

`apply` **never executes commands**. It only writes files:

- Copies approved skill folders → `.claude/skills/<name>/SKILL.md`
- Writes approved MCP server entries → `.mcp.json` (the launch command lives *in* the config; the agent starts it on demand)
- Generates `CLAUDE.md` (project guidance + when to use which capability), `AI_STACK.md` (human-readable selection/rejection rationale, risks, provenance), `stack.lock.json` (exact capability IDs, versions, catalog release, install status)

Anything genuinely executable (global installs, binary downloads, secret setup) is printed as a clearly labeled **"run this yourself"** checklist with required permissions/secrets shown. Dry-run is the default review path. Risky permissions (browser/network/filesystem/shell/credentials) get a visible risk summary. Unverified-tier capabilities are never auto-recommended.

### 6.4 Starter content (knowledge ≠ installation)

- **Starter capability catalog:** bundled versioned JSON inside the CLI covering planning, debugging, testing, frontend, security, docs, APIs, databases, performance. Imported into Supermemory at init so the first `recommend` works offline/before the first sync; reconciled with the live catalog on first `update`.
- **Three bundled core skills** (optional install at init): Project Planning, Root-Cause Debugging, Verification Before Completion. Text-only, trusted, few by design.

## 7. Memory architecture (Supermemory Local)

### 7.1 Container strategy — three tags

| containerTag | Contents | Scope rationale |
|---|---|---|
| `catalog` | Narrative Capability Cards (semantic form of the public catalog) | Shared knowledge; one space, deterministic twin lives in local JSON |
| `project_<slug>` | Project purpose, stack, constraints, stage, what's installed | Strict per-project isolation; profiles never bleed across projects |
| `experience` | ALL accept/reject decisions (with reasons), feedback verdicts, inferred preferences — from every project; each memory names its source project | **Deliberately user-level**: cross-project learning is the hero, so lessons must be retrievable from any future project |

### 7.2 Memory capture — when memories are written

| Moment | What is stored | Container |
|---|---|---|
| `project init` | Structured profile narrative | `project_<slug>` |
| `apply` (per item) | "Accepted X for <project>: <reason>" / "Rejected X for <project>: <reason>" — automatic, no extra user work | `experience` |
| `apply` result | Which files were written, which capabilities installed | `project_<slug>` |
| `feedback` (end of project) | "X was useful in <project>" / "X was not useful in <project>: <why>" per listed capability | `experience` |
| `update` | New/updated narrative Capability Cards; deprecated cards marked | `catalog` |

### 7.3 Two-path ranking — how memory bends the outcome

Deterministic base score (local JSON data): project relevance, compatibility, trust tier, maintenance/freshness, permission fit, install complexity, overlap penalty. Deprecated = blocking; unverified = blocked from auto-recommendation; cloud-only tools blocked when the project constraint says local-only.

Then memory applies through **two distinct paths**:

- **Path 1 — deterministic (exact capability ID):** a "not useful" verdict or failed install for capability X applies a direct numeric penalty to X (a "useful" verdict boosts it). Predictable, auditable, explainable.
- **Path 2 — semantic (patterns):** `experience` is queried by similarity to the *current* project profile; retrieved pattern memories ("rejected 3 cloud tools for privacy", "prefers minimal setups") are handed to the LLM alongside the top candidates, which adjusts the ranking and writes the human explanations ("Skipping X — you've consistently avoided cloud processing"). This is the part only semantic memory can do.

Output is a deliberately minimal stack (target 3–5 items) plus the rejected list with reasons.

## 8. End-to-end flows

### 8.1 The full loop (demo-shaped)

```text
GitHub Actions (daily)                    User machine
─────────────────────                     ────────────
sources → classify → verify →             agentstack update
extract → dedupe → version →      ──►     (pull deltas → verify → local JSON
catalog release on GitHub                  + Supermemory `catalog`)
                                              │
                                          agentstack project init   (idea + light scan → profile)
                                              │
                                          agentstack recommend      (catalog ∩ profile ∩ experience)
                                              │
                                          agentstack apply --dry-run → approve → files written
                                              │                      (decisions auto-saved → `experience`)
                                          agentstack feedback        (y/n per capability → `experience`)
                                              │
                                          NEXT PROJECT: recommend  ← visibly changed by experience
```

### 8.2 Recommendation internals

1. Load project profile (`project_<slug>` + local JSON).
2. Semantic query against `catalog` → candidate capabilities.
3. Deterministic filter: deprecated, incompatible agent/language, constraint violations (e.g. cloud-only vs local-only), already installed (from scan), overlap dedup.
4. Deterministic scoring + Path-1 feedback adjustments.
5. Semantic query against `experience` using the project profile → pattern memories.
6. LLM receives: top candidates + profile + pattern memories → final ranked minimal stack + explanations + rejections.
7. Render with scores, reasons, provenance, and risk summaries.

## 9. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript everywhere** (Node.js ≥ 22) | Supermemory SDK is TS-first; CLI and pipeline share the `CapabilityCard` schema/types |
| Monorepo | Single public repo: `cli/` + `pipeline/` + `catalog/` (+ `starter/`) | One repo for judges; Actions commits releases into `catalog/` |
| CLI framework | `commander` + `@clack/prompts` | Standard command parsing + polished interactive prompts |
| Validation | `zod` | Capability Card schema, catalog releases, config — with LLM repair-retry on validation failure |
| Memory | `supermemory` SDK → `baseURL: "http://localhost:6767"` | Hackathon requirement; hosted `api.supermemory.ai` is prohibited in this build |
| LLM | **Provider-agnostic OpenAI-compatible client**; cloud-only; provider/key chosen at testing time (open decision in todo.md); no Ollama in v1 | User decision pending; swap = env/config change |
| Local state | **Plain JSON files** under `~/.agentstack/` (config, catalog mirror, projects/, installs/) — no SQLite | Tiny data volumes, zero native deps on Windows, human-inspectable in the demo |
| Global pipeline runtime | GitHub Actions (cron + workflow_dispatch) | Genuinely "daily" with zero hosted infra; visibly real in the repo |
| Catalog distribution | Versioned JSON + manifest with sha256 checksums, served via raw.githubusercontent.com | Real HTTPS release API without a server |
| Target coding agent | **Claude Code only**, behind an agent-adapter interface (skills path, MCP config format, instruction filename) | One adapter done well; Cursor/Codex are honest roadmap items |

## 10. Data models (canonical shapes)

### Capability Card (shared type, zod-validated)

```json
{
  "id": "mcp:example/browser-debug",
  "name": "Browser Debug MCP",
  "type": "mcp | skill | cli | plugin",
  "summary": "...",
  "useWhen": ["..."], "doNotUseWhen": ["..."],
  "categories": ["..."], "agents": ["claude-code"], "languages": ["..."],
  "permissions": ["browser", "network"],
  "installation": { "command": "npx ...", "mcpConfig": { } },
  "localCloud": "local | cloud | hybrid",
  "version": "1.2.0", "status": "active | deprecated | removed",
  "trust": "official | curated | community | unverified",
  "sources": [{ "url": "...", "kind": "registry | repo | rss" }],
  "firstSeen": "...", "lastChecked": "...", "contentHash": "..."
}
```

### Catalog manifest

```json
{
  "latestVersion": "2026.07.17.1",
  "releases": [{ "version": "...", "deltaPath": "catalog/deltas/....json", "sha256": "..." }]
}
```

### `stack.lock.json` (generated per project)

```json
{
  "catalogRelease": "2026.07.17.1",
  "capabilities": [{ "id": "...", "version": "...", "installedAs": "skill | mcp-config", "approvedAt": "...", "source": "..." }]
}
```

### Experience memory (narrative, stored in Supermemory `experience`)

```text
"In project 'pdf-chat-electron' (privacy-first Electron PDF chat app), the user
REJECTED 'mcp:cloud/document-search' because it violates the local-only
constraint. (2026-07-17)"
```

## 11. Execution plan

Ordered build phases; each ends in something runnable. (Detailed checklist lives in `todo.md`.)

- **Phase 0 — Ground truth (first!):** verify Supermemory Local starts on this Windows machine (`npx supermemory local`), confirm `sm_` key + add/search round-trip with the SDK against `localhost:6767`. *Everything depends on this; do it before any other code.*
- **Phase 1 — Skeleton:** monorepo scaffold, shared zod `CapabilityCard` schema, `~/.agentstack/` config module, provider-agnostic LLM client.
- **Phase 2 — Pipeline:** three source adapters → classify → verify → extract → dedupe/version → release writer; starter catalog authored; GitHub Actions workflow.
- **Phase 3 — Catalog sync:** `init` + `update` + `discoveries` + `inspect` (manifest fetch, checksum verify, JSON upsert, Supermemory `catalog` ingestion, digest).
- **Phase 4 — Project loop:** `project init` (idea mode + light scan) → `recommend` (two-path ranking) → `apply` (dry-run, approvals, file writes via Claude Code adapter, decision memories).
- **Phase 5 — Memory climax:** `feedback` command; end-to-end two-project test proving a changed recommendation citing project A's experience.
- **Phase 6 — Ship:** README (architecture + judging mapping + setup), public GitHub repo with fresh commit history, demo video (script TBD), Google Form, Discord showcase post.

## 12. Explicitly out of scope (v1)

- Hosted server, Postgres/Supabase, signed (cryptographic) releases — checksums only
- Local LLM / Ollama mode; the privacy story rests on local storage/search/state
- Executing any install command on the user's behalf
- Cursor/Codex/other agent adapters (interface exists; adapters are roadmap)
- Deep source-code repo analysis; manual-review operator queue UI; internet-wide crawling
- Marketplace, billing, team features, outcome telemetry

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Supermemory Local doesn't run cleanly on Windows | Phase 0 verifies immediately; fallbacks: WSL or Docker (hackathon.md notes this) |
| LLM provider undecided | Provider-agnostic client from day one; decision is config-only (tracked in todo.md) |
| RSS classification quality is noisy | Confidence thresholds: high → auto, medium → held, low → logged and ignored |
| Two-project demo loop feels staged | Feedback + decisions are stored through the real commands, not seeded by hand; retrieval wording differs from storage wording to showcase semantic search |
| Scope creep vs deadline | Command surface frozen at 8; sources frozen at 3; any addition requires removing something |

## 14. Success criteria

1. A capability published in a source appears in the next catalog release (freshness) with one canonical identity (dedup).
2. `update` reliably brings missing releases into local JSON + Supermemory `catalog`.
3. `recommend` selects a relevant new capability for a matching project and rejects it (with reason) for an incompatible one (explainability).
4. `apply` changes nothing without dry-run + per-item approval; `stack.lock.json` records exact versions/release (safety, reproducibility).
5. Feedback and decisions from project A demonstrably change project B's recommendation, with the explanation citing the earlier experience (learning — the hero).
6. No private project data leaves the machine; the only network traffic is pulling public catalog JSON and the user-chosen LLM API (privacy).
