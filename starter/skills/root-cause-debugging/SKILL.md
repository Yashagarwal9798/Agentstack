---
name: root-cause-debugging
description: Diagnose bugs with evidence before changing code. No fix may be attempted until the cause is demonstrated, preventing symptom-patching.
---

# Root-Cause Debugging

A fix written before the cause is proven is a guess. Guesses compound.

## Rules

1. **Reproduce first.** Find the smallest reliable way to trigger the bug. If you cannot reproduce it, you are not ready to fix it — gather more information instead.
2. **State a hypothesis before gathering evidence.** "I believe X causes this because Y." Then design the observation that would prove or disprove it.
3. **Collect evidence, not impressions.** Logs, stack traces, variable values at the failure point, git history of the failing code. Read the actual error text carefully — most bugs announce themselves.
4. **Write the diagnosis before the fix.** One or two sentences: what happens, why, and where. If you cannot write this, you do not understand the bug yet.
5. **Fix the cause, not the symptom.** A `try/catch` around the crash site, a null-check that hides missing data, a retry that masks a race — these treat symptoms. Ask: "would this fix still be correct if I understood nothing about why it works?"
6. **Verify the fix against the original reproduction**, and check the fix didn't break the surrounding behavior.

## Anti-patterns to refuse

- Changing code "to see if it helps"
- Fixing a second thing noticed along the way (note it, report it, leave it)
- Declaring success because the error message changed
- Blaming the environment/library/tooling before evidence rules out your own code

## Output format

```
Reproduction: <how to trigger it>
Hypothesis: <believed cause>
Evidence: <what was observed that proves it>
Diagnosis: <what happens, why, where>
Fix: <the minimal change addressing the cause>
Verified: <reproduction now passes + what else was checked>
```
