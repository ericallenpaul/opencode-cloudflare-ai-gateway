# Benchmark Auto Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-interactive benchmark harness that drives Claude, Codex, and OpenCode end-to-end, validates model/routing expectations, and runs the deterministic judge without manual checkpoints.

**Architecture:** Add a new policy-driven runner at `benchmarks/scripts/benchmark-auto.ps1` and keep the current manual scripts as a secondary path. Each target declares execution and validation expectations in `policy.json`, while the runner handles scratch directories, tool adapters, normalized result records, invalidation, and deterministic judging.

**Tech Stack:** PowerShell 7, existing Node/Playwright judge, existing CLI tools (`claude`, `codex`, `opencode`), `ccusage`

---

### Task 1: Define the target policy contract

**Files:**
- Create: `benchmarks/tic-tac-toe/policy.json`
- Create: `benchmarks/markdown-editor/policy.json`

- [ ] **Step 1: Add `tic-tac-toe` policy**

Create a policy that enables all three tools, sets strict architecture-mode model expectations, defines expected output patterns, enables deterministic judging, and allows the qualitative layer to remain optional.

- [ ] **Step 2: Add `markdown-editor` policy**

Create the same contract for `markdown-editor`, but reuse only the generic output and tool-expectation pieces so the target can adopt automation later without script changes.

- [ ] **Step 3: Validate policy parsing**

Run:

```powershell
Get-Content benchmarks\tic-tac-toe\policy.json -Raw | ConvertFrom-Json | Out-Null
Get-Content benchmarks\markdown-editor\policy.json -Raw | ConvertFrom-Json | Out-Null
```

Expected: both commands complete with no JSON parse errors.

### Task 2: Implement the automated runner

**Files:**
- Create: `benchmarks/scripts/benchmark-auto.ps1`
- Reference: `benchmarks/scripts/bench-run.ps1`
- Reference: `benchmarks/scripts/judge-run.ps1`

- [ ] **Step 1: Build runner skeleton**

Add parameters for benchmark selection, tool filtering, timeout/mode overrides, optional judge execution, and optional qualitative execution.

- [ ] **Step 2: Implement policy loading and scratch/results layout**

Use:

```text
benchmarks/runs/<RunId>/<target>/<tool>/
benchmarks/<target>/results/runs/<RunId>/<tool>/
```

Write one normalized machine-readable result file per tool plus one run summary file at the run root.

- [ ] **Step 3: Implement shared helpers**

Reuse simplified logic for:
- loading prompt text
- invoking `ccusage`
- collecting before/after snapshots
- extracting session deltas
- validating expected outputs
- inferring providers/models
- writing normalized JSON and markdown summaries

- [ ] **Step 4: Implement adapters**

Add one adapter per tool:

```text
claude   -> claude -p --output-format json
codex    -> codex exec --json
opencode -> opencode run --format json
```

Each adapter must:
- run in the tool scratch directory
- write raw stdout/stderr/event logs
- return exit code
- expose requested model and actual model evidence

- [ ] **Step 5: Implement invalidation**

Invalidate when:
- deliverables are missing
- requested model is rejected
- actual models cannot be determined
- actual models violate the target policy
- OpenCode routing is required but worker-tier models do not appear

- [ ] **Step 6: Wire deterministic judging**

Invoke `judge-run.ps1` automatically after tool execution when the run produced at least one valid output candidate.

### Task 3: Test the harness incrementally

**Files:**
- Modify: `benchmarks/scripts/benchmark-auto.ps1`
- Output: `benchmarks/tic-tac-toe/results/runs/<RunId>/...`

- [ ] **Step 1: Dry-run policy and argument flow**

Run:

```powershell
pwsh -File benchmarks\scripts\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode -WhatIf
```

Expected: the script resolves the target, tool list, and directories without launching a CLI.

- [ ] **Step 2: Execute one real OpenCode run**

Run:

```powershell
pwsh -File benchmarks\scripts\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode
```

Expected: the runner creates output artifacts, writes a normalized result file, and runs the deterministic judge.

- [ ] **Step 3: Execute one real Claude run**

Run:

```powershell
pwsh -File benchmarks\scripts\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools claude
```

Expected: the runner captures JSON output and either validates the run or records a clear invalidation reason.

- [ ] **Step 4: Execute one real Codex run**

Run:

```powershell
pwsh -File benchmarks\scripts\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools codex
```

Expected: the runner clearly records the ChatGPT-account model restriction if the requested model is unsupported.

### Task 4: Document the new primary path

**Files:**
- Modify: `benchmarks/README.md`
- Modify: `benchmarks/scripts/README.md`

- [ ] **Step 1: Add automated usage docs**

Document the new primary command, policy contract, and run artifacts.

- [ ] **Step 2: Document manual mode as secondary**

Keep the existing guided workflow documented, but mark it as a fallback/manual path.

- [ ] **Step 3: Document current known limitations**

Call out:
- Codex ChatGPT-account model restrictions
- OpenCode routing validation behavior
- qualitative judging remaining optional

### Task 5: Final verification

**Files:**
- Verify: `benchmarks/scripts/benchmark-auto.ps1`
- Verify: `benchmarks/tic-tac-toe/policy.json`
- Verify: `benchmarks/markdown-editor/policy.json`
- Verify: `benchmarks/README.md`
- Verify: `benchmarks/scripts/README.md`

- [ ] **Step 1: Re-run JSON parse checks**

Run:

```powershell
Get-Content benchmarks\tic-tac-toe\policy.json -Raw | ConvertFrom-Json | Out-Null
Get-Content benchmarks\markdown-editor\policy.json -Raw | ConvertFrom-Json | Out-Null
```

Expected: PASS.

- [ ] **Step 2: Re-run one full automated benchmark**

Run:

```powershell
pwsh -File benchmarks\scripts\benchmark-auto.ps1 -Benchmark tic-tac-toe
```

Expected: each tool is either valid or explicitly invalidated, and the run directory contains raw logs, normalized result JSON, deliverables, and deterministic judge output.

- [ ] **Step 3: Verify docs match implementation**

Check that the commands and file paths in `benchmarks/README.md` and `benchmarks/scripts/README.md` match the shipped script names and outputs.
