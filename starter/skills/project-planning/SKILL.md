---
name: project-planning
description: Turn a project idea or large feature into staged, verifiable implementation tasks with acceptance criteria before writing any code.
---

# Project Planning

Before implementing anything non-trivial, produce a plan and get it confirmed.

## Process

1. **Restate the goal** in one sentence. If your restatement might not match the user's intent, ask before continuing.
2. **List the unknowns.** Anything you'd have to assume — name it explicitly. Resolve each by reading the code, checking docs, or asking. Never resolve an unknown by silently guessing.
3. **Break the work into stages.** Each stage must:
   - Deliver something runnable or verifiable on its own
   - Fit in one focused work session
   - Depend only on stages before it
4. **Give every stage acceptance criteria** — a concrete check ("command X exits 0", "the UI shows Y after doing Z"), not a vibe ("works correctly").
5. **State what is out of scope.** Listing what you will NOT do prevents scope creep as effectively as listing what you will.
6. **Present the plan and wait for confirmation** before starting stage 1.

## While executing

- Work one stage at a time; do not pull tasks forward from later stages.
- When a stage's acceptance check fails, fix it before moving on — never stack unverified stages.
- If reality contradicts the plan (missing API, wrong assumption), stop and revise the plan visibly instead of improvising.

## Output format

```
Goal: <one sentence>
Assumptions: <each one, or "none">
Stage 1: <task> → verify: <check>
Stage 2: <task> → verify: <check>
...
Out of scope: <list>
```
