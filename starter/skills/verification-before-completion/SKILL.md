---
name: verification-before-completion
description: Never declare a task done without demonstrated proof - run the code, run the tests, show the output. Claimed success without evidence is failure.
---

# Verification Before Completion

"It should work now" is not a completion state. Evidence is.

## Rules

1. **Define the check before finishing.** For every task, know what command, test, or observable behavior demonstrates success. If the task came without one, derive it and state it.
2. **Run it.** Actually execute the tests, build, linter, or the program itself. Reading the code and concluding it's correct is not verification.
3. **Show the output.** Completion claims must include the actual result: the passing test summary, the exit code, the screenshot, the rendered response. Paraphrased success ("tests pass") without shown output is not acceptable.
4. **Exercise the change itself,** not just the suite around it. If you added an endpoint, call it. If you changed a CLI command, run that command. A green unrelated test suite proves nothing about your change.
5. **Failures are reported, not hidden.** If the check fails, say so with the output, then fix it. Never narrow, skip, or delete a failing test to make the report green. Never claim partial success as full.
6. **Edge check before done:** empty input, missing file, first run (no state), second run (existing state). Pick the ones that apply and try at least the likely-fragile one.

## Completion report format

```
Change: <what was done>
Check: <command/test/behavior used as proof>
Result: <actual output, verbatim or screenshot>
Not verified: <anything intentionally left unchecked, and why>
```

If the "Result" line would be empty, the task is not complete.
