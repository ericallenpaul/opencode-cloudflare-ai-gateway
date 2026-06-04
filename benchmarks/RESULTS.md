# Benchmark Results

This is the reader-facing benchmark summary. It separates the publishable selected results from the raw harness and methodology notes in the [benchmark README](README.md).

## Headline

Across the selected comparison set, OpenCode produced a 10/10 judged output for all three benchmark targets and was cheaper than Claude Code and Codex CLI on every selected row.

| Benchmark | Selected artifact(s) | OpenCode | Codex CLI | Claude Code |
|---|---|---:|---:|---:|
| `markdown-editor` | [`2026-05-26-0829`](markdown-editor/results/runs/2026-05-26-0829/) | **10/10, $0.83** | 10/10, $1.35 | 9/10, $4.93 |
| `react-todo-api-db` | [`2026-05-31-164112`](react-todo-api-db/results/runs/2026-05-31-164112/) | **10/10, $0.193** | 10/10, $2.032 | 9/10, $1.580 |
| `tic-tac-toe` | [selected 2026-06-02 artifacts](tic-tac-toe/results/runs/2026-06-02-selected-functional.md) | **10/10, $0.1753** | 10/10, $3.0120 | 10/10, $3.0039 |

## Cost Ratios

| Benchmark | OpenCode vs Codex CLI | OpenCode vs Claude Code |
|---|---:|---:|
| `markdown-editor` | 1.6x cheaper | 5.9x cheaper |
| `react-todo-api-db` | 10.5x cheaper | 8.2x cheaper |
| `tic-tac-toe` | 17.2x cheaper | 17.1x cheaper |

## Token Snapshot

Comparable token totals are not equally clean for every historical selected row. The cleanest structured token comparison is the final `tic-tac-toe` selected snapshot:

| Tool | Source artifact | Cost | Total tokens | Functional result |
|---|---|---:|---:|---:|
| **OpenCode** | [`2026-06-02-opencode-only-fixed`](tic-tac-toe/results/runs/2026-06-02-opencode-only-fixed/) | **$0.1753** | **805,731** | 10/10 |
| Codex CLI | [`2026-06-02-140953`](tic-tac-toe/results/runs/2026-06-02-140953/) | $3.0120 | 3,352,097 | 10/10 |
| Claude Code | [`2026-06-02-140953-claude-fixed`](tic-tac-toe/results/runs/2026-06-02-140953-claude-fixed/) | $3.0039 | 8,942,555 | 10/10 |

On that target, OpenCode used about 4x fewer tokens than Codex and 11x fewer tokens than Claude while passing the same deterministic 10/10 judge.

## Caveat

The selected rows are fair for cost-per-correct-result: each tool was judged against the same target prompt, SPEC, and deterministic requirements for that benchmark. They are not proof that every agent succeeds on every first attempt.

That caveat is part of the result. Creating one-shot projects of varying difficulty, then getting Claude Code, Codex CLI, and OpenCode to all produce comparable successful outputs, took days of harness work and reruns. The June 2 `tic-tac-toe` publication row is a selected functional comparison, not a single uninterrupted all-tool batch run.

## Source Logs

- [`markdown-editor` comparisons log](markdown-editor/results/comparisons.md)
- [`react-todo-api-db` comparisons log](react-todo-api-db/results/comparisons.md)
- [`tic-tac-toe` selected functional snapshot](tic-tac-toe/results/runs/2026-06-02-selected-functional.md)
- [`tic-tac-toe` comparisons log](tic-tac-toe/results/comparisons.md)
