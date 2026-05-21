# tic-tac-toe results

This directory holds the committed artifacts from every benchmark run of the tic-tac-toe target.

## Layout

```
results/
├── README.md                  (this file)
├── comparisons.md             ranking log across every run, hand-maintained
└── runs/
    └── <RunId>/               one benchmark session, e.g. 2026-05-21-1730/
        ├── claude/
        │   ├── output/        agent-generated files (tictactoe.html, tests, etc.)
        │   ├── notes.md       scored against SPEC.md + observations
        │   ├── _delta.json    raw ccusage diff
        │   ├── _delta-summary.txt
        │   ├── _ccusage-before.json / .txt
        │   ├── _ccusage-after.json / .txt
        │   ├── _start-time.txt / _end-time.txt
        │   ├── _run-id.txt
        │   └── _session-transcript/   (best-effort, tool-specific)
        ├── codex/             same shape
        └── opencode/          same shape
```

A single RunId ties one Claude + Codex + OpenCode run together so they can be compared apples-to-apples (same prompt, same window, same baseline). Multiple RunIds accumulate over time and let us track run-to-run variance.

## Workflow

The `bench-run.ps1` wrapper handles everything:

```powershell
cd "<repo>\benchmarks\scripts"

# One call -- creates scratch dirs and captures ccusage baselines for ALL configured tools
.\bench-run.ps1 -Phase start
# Follow the printed per-tool instructions in three terminals

# Once all three tools have finished, one finish call processes everything:
& "<repo>\benchmarks\scripts\bench-run.ps1" -Phase finish -RunId <run-id>
```

The finish phase writes everything under `runs/<RunId>/` and stubs each tool's `notes.md` with metrics pre-filled. You fill in the R1-R10 scores and observations, then add a ranking line to `comparisons.md`.

See [`../METHODOLOGY.md`](../METHODOLOGY.md) for the full run procedure and [`../../scripts/README.md`](../../scripts/README.md) for script details.

## Quick links

- [`comparisons.md`](comparisons.md) — ranking log across all runs
- [`../PROMPT.md`](../PROMPT.md) — the canonical prompt each tool receives
- [`../SPEC.md`](../SPEC.md) — R1-R10 acceptance criteria + quality dimensions
