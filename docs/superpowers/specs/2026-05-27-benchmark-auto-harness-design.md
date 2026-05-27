# Benchmark Auto Harness Design

Date: 2026-05-27
Status: approved for implementation
Scope: replace the current benchmark default path with a non-interactive, adapter-based harness that is modular enough to add new benchmark targets without script edits in normal cases.

## Problem

The current benchmark system is useful as a research notebook but weak as a benchmark harness for the repo's actual thesis.

Current issues:

- The primary path is manual. A human launches each tool, pastes the prompt, waits, and resumes the workflow later.
- Runs are not invalidated automatically when the tool uses the wrong model or when OpenCode fails to exercise tier-routing.
- The harness captures what happened after the fact, but does not enforce the run contract up front.
- Qualitative judging is wired into the primary workflow instead of being an optional second layer.
- The system is only loosely modular. New targets are convention-based, but the main loop is still optimized for the old manual workflow.

The actual question we want to answer is narrower and stricter:

> Did the tiered OpenCode architecture reduce token cost while maintaining acceptable reliability and functional correctness?

That requires hard invalidation rules, not just metrics collection.

## Goals

- Non-interactive execution by default for Claude, Codex, and OpenCode
- Adapter-based tool execution so each CLI can be automated cleanly
- Modular benchmark targets with a standard folder contract
- Strict invalidation when model/provider/routing expectations are not met
- Deterministic functional judging as part of the main path
- Qualitative judging kept available, but optional and non-blocking
- Target addition should require adding files in `benchmarks/<target>/`, not editing the harness for routine cases

## Non-goals

- Perfectly simulating the interactive UX of each tool
- Eliminating all nondeterminism
- Replacing the existing manual harness immediately; it can remain as a secondary mode
- Solving every tool-specific auth or account-tier issue in code

## Proposed architecture

Add a new primary harness:

- `benchmarks/scripts/benchmark-auto.ps1`

Keep the existing manual path:

- `benchmarks/scripts/benchmark.ps1`
- `benchmarks/scripts/bench-run.ps1`
- `benchmarks/scripts/judge-run.ps1`
- `benchmarks/scripts/judge-summarize.ps1`

The new auto harness is organized around two concepts:

1. **Target policies**
2. **Tool adapters**

### Target folder contract

Each target keeps the existing files and gains a policy file:

```text
benchmarks/<target>/
├── PROMPT.md
├── SPEC.md
├── METHODOLOGY.md
├── policy.json
├── results/
└── judge/
```

The new required file is `policy.json`.

### `policy.json`

Each target policy declares:

- expected deliverables
- per-tool execution expectations
- model/provider requirements
- invalidation rules
- timeout budget
- whether qualitative judging is required

Example shape:

```json
{
  "name": "tic-tac-toe",
  "mode": "architecture",
  "expectedOutputs": {
    "html": ["tictactoe.html"],
    "tests": ["*.test.js"]
  },
  "tools": {
    "claude": {
      "enabled": true,
      "requestedModel": "claude-sonnet-4-5",
      "expectedModels": ["claude-sonnet-4-5"],
      "allowAdditionalModels": false
    },
    "codex": {
      "enabled": true,
      "requestedModel": "gpt-5",
      "expectedModels": ["gpt-5"],
      "allowAdditionalModels": false
    },
    "opencode": {
      "enabled": true,
      "requestedModel": "openai-via-gateway/gpt-5",
      "expectedModels": ["gpt-5", "@cf/zai-org/glm-4.7-flash"],
      "requiredModels": ["gpt-5", "@cf/zai-org/glm-4.7-flash"],
      "allowAdditionalModels": true,
      "requireRouting": true
    }
  }
}
```

### Tool adapters

Each adapter implements the same logical contract:

- prepare working directory
- execute the tool non-interactively
- capture stdout/stderr/raw events
- snapshot ccusage before and after
- normalize actual models used
- return a run record with validity or invalidation reason

Adapters:

- `claude`
  - use `claude -p --output-format json`
- `codex`
  - use `codex exec --json`
- `opencode`
  - use `opencode run --format json`

## Run contract

Every automated run produces a normalized result object with:

- tool
- benchmark
- run id
- requested model
- actual models used
- provider set inferred from model names
- wall clock
- cost/tokens from ccusage delta
- exit code
- output artifact paths
- validity
- invalidation reasons

## Invalidation rules

A run is invalid if any of the following are true:

- non-zero exit code with no acceptable artifact output
- missing expected deliverables
- deterministic functional judge cannot run
- actual models used are missing
- actual models differ from policy when `allowAdditionalModels` is false
- required models are not all present
- OpenCode routing was required but only the frontier model appears
- the requested model is rejected by the tool account or CLI

This solves the core problem that a tool could silently downgrade models and still count as a benchmark result.

## Modes

The new harness supports two benchmark modes:

- `architecture`
  - strict model and routing assertions
  - intended for OpenCode tier-routing thesis
- `tool`
  - looser model expectations
  - intended for "recommended daily setup" comparisons

Mode is target policy data, not hardcoded logic.

## Qualitative judging

Deterministic judging remains first-class.

Qualitative judging becomes optional:

- `judge-run.ps1` remains the deterministic functional gate
- `judge-summarize.ps1` remains available
- auto harness can skip the qualitative phase by default

This keeps the benchmark runnable end-to-end without human intervention.

## Current tool realities discovered during design

These are implementation constraints, not wishlist items:

- Claude non-interactive mode exposes structured JSON including `modelUsage`
- OpenCode non-interactive mode exposes structured event JSON, but model validation still needs ccusage normalization for consistency
- Codex non-interactive mode works, but the local account in this environment rejects explicit `gpt-5` and `gpt-5-mini` in `codex exec` with ChatGPT-account restrictions

Implication:

- Codex must either be invalidated clearly under strict model policies, or be run in a separate "tool default model" policy where that is acceptable

The harness should make this explicit rather than silently bending the rules.

## Implementation plan

1. Add `policy.json` to `tic-tac-toe` and `markdown-editor`
2. Implement `benchmark-auto.ps1`
3. Reuse the existing ccusage delta logic in simplified form
4. Reuse `judge-run.ps1` for deterministic judging
5. Make qualitative judging opt-in
6. Test against `tic-tac-toe` first
7. Expand to `markdown-editor` after the path is stable

## Success criteria

- `benchmark-auto.ps1 -Benchmark tic-tac-toe` runs without manual checkpoints
- each tool run is either valid or explicitly invalidated with a machine-readable reason
- OpenCode tier-routing runs fail loudly if no cheaper worker model appears
- adding a new benchmark target requires a new target folder plus `policy.json` and judge spec, not script edits

