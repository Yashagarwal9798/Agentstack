# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes, plus the working rules for building **AgentStack Radar** in this repo.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## Project ground rules (read first)

### Follow the documents — they outrank your instincts

- [prd.md](prd.md) — what we're building and why. Source of truth for scope and behavior.
- [architecture.md](architecture.md) — how every component and feature is built. Do not deviate from the described flows, layouts, contracts, or container strategy.
- [phase.md](phase.md) — the build order and per-phase checklists.
- [todo.md](todo.md) — open decisions and follow-ups.

If the docs don't specify something, it's a decision — **stop and ask, don't invent.** If you believe a doc is wrong, say so explicitly and propose the change; never silently diverge.

### Go phase by phase

- Work on exactly ONE phase from [phase.md](phase.md) at a time, in order. No skipping ahead, no "while I'm here" work from later phases.
- A phase is complete only when its **Done when** checks pass with shown output — not claimed output.
- **After every completed phase, update [context.md](context.md)** with a section for that phase containing:
  - What was built (components, behavior)
  - Files created/changed
  - Verification results (the actual Done-when check outputs)
  - Deviations from plan and why
  - Gotchas/discoveries the next phase must know (API surprises, Windows quirks, config values)
- Tick the phase's checkboxes in phase.md and fill its Notes line.
- At the start of any session, read context.md before writing code — it is the memory of what already exists.

### The CLI must look GOOD — this is a hard requirement

A plain, unstyled CLI is a failed deliverable. This tool will be judged partly on a 3-minute demo of its terminal output. Every command must be visually polished:

- **Colors everywhere, with meaning:** use `picocolors` (or chalk) consistently — cyan for info/ids, green for success/additions, yellow for warnings/holds, red for errors/rejections/deprecations, dim for secondary detail. Define one shared palette/theme module in `cli/src/core/ui.ts` and use it in every command — no raw `console.log` dumps of unstyled text.
- **Interactive prompts:** `@clack/prompts` for all user input (intro/outro banners, spinners, select/confirm/multiselect, styled cancellation).
- **Structure the output:** section headers, aligned key-value layouts, tables for lists (capabilities, discoveries, feedback items), boxed summaries for results (e.g. update digests, recommendation stacks), tree views for file plans in dry-run.
- **Progress feedback:** spinners for every network/LLM operation with meaningful labels ("Searching Supermemory…", "Verifying delta 2026.07.17.1…").
- **Symbols:** ✔ ✖ ⚠ ● → for status lines; scores and trust tiers rendered visually (e.g. colored score, trust badge).
- **A branded feel:** a small ASCII/gradient banner on `init` and command intros via clack's `intro()` — the CLI should feel like a product, not a script.
- Respect `NO_COLOR`/non-TTY (CI) by degrading gracefully — clack and picocolors handle this; don't fight them.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, every phase ends with a context.md entry, and no command in the CLI prints plain unstyled output.
