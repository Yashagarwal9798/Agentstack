# Phase 0 Findings — Supermemory Local on this machine

**Status: PARTIALLY COMPLETE — paused waiting for an LLM provider API key.**

## What happened

- `npx -y supermemory local` (run from Windows PowerShell) fetched the installer from `https://supermemory.ai/install`.
- The installer detected `bash` and ran inside **WSL**, not native Windows:
  - Platform detected: `linux-x64`
  - Version installed: **supermemory-server 0.0.5**
  - sha256 verified by the installer
  - Binary: `/home/yash/.supermemory/bin/supermemory-server` (WSL user: `yash`)
  - Provider config file: `/home/yash/.supermemory/env`
- This matches hackathon.md's Windows warning: native Windows binaries aren't the path here — **WSL is our runtime for Supermemory Local**. WSL2 forwards `localhost`, so `http://localhost:6767` should be reachable from Windows once the server runs (verify on resume).

## The blocker

First-run setup requires **at least one LLM API key for embeddings/summaries** before the server starts:

```text
supermemory-server needs at least one LLM API key for embeddings/summaries.
  1) OpenAI    (OPENAI_API_KEY)
  2) Anthropic (ANTHROPIC_API_KEY)
  3) Gemini    (GEMINI_API_KEY)
  4) Skip for now
```

The prompt is interactive; we killed the process rather than answer it blind. User has no API key yet (2026-07-17); recommended fastest path: free Gemini key from aistudio.google.com/apikey.

**Note for prd.md accuracy:** this means Supermemory Local's own processing (embeddings/summaries) calls a cloud provider in this version — consistent with our cloud-only LLM decision, but worth stating honestly in the README's privacy section: storage/search state is local, model calls are not.

## Resume plan (when `.env.local` exists with GEMINI_API_KEY)

1. Append the key non-interactively (no re-prompt):
   `wsl -e bash -lc "echo 'GEMINI_API_KEY=<key>' >> ~/.supermemory/env"`
2. Start the server: `wsl -e bash -lc "~/.supermemory/bin/supermemory-server"` (background task).
3. Capture from startup output: URL (expect `http://localhost:6767`), the generated `sm_` API key, org id, data dir.
4. Verify reachability from Windows: `Invoke-WebRequest http://localhost:6767` (or the SDK health path).
5. Scratch script (scratchpad, `supermemory` npm SDK): `memories.add` with `containerTag`, differently-worded `search.memories`, and the customId double-add upsert test (architecture §1.1 depends on update-in-place).
6. Record results + API surprises here; then Phase 0 is done.

## Open questions to answer on resume

- Where does the WSL install put its data dir (`./.supermemory` relative to CWD, or `~/.supermemory/`)? Affects backup/demo story.
- Does the `sm_` key print on every start or only first run? (If only first run, capture it immediately.)
- Exact SDK search response shape for v0.0.5 (docs may be ahead of the local build).
