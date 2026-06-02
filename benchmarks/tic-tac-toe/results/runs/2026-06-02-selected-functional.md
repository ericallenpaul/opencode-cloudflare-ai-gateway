# Tic-Tac-Toe Selected Functional Snapshot -- 2026-06-02

This is the selected publishable functional snapshot for the tic-tac-toe benchmark.
It uses the same benchmark prompt, SPEC, deterministic Playwright judge, and R1-R10
criteria for all tools, but it is not a single uninterrupted all-three run.

The same-day all-tool run exposed the practical reproducibility problem this benchmark
is meant to make visible: different agent CLIs, plugins, and LLMs do not behave
consistently on every attempt. Claude needed a corrected rerun after a failed artifact;
OpenCode needed the unattended-harness fixes and judge score-parser fix already committed
in this branch. The selected rows below are the successful artifacts used for the fair
cost/token comparison.

| Tool | Source artifact | Functional result | Cost | Total tokens | Models observed |
|---|---|---:|---:|---:|---|
| Claude Code | [`2026-06-02-140953-claude-fixed/claude`](2026-06-02-140953-claude-fixed/claude/) | 10/10 | $3.0039 | 8,942,555 | `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001` |
| Codex CLI | [`2026-06-02-140953/codex`](2026-06-02-140953/codex/) | 10/10 | $3.0120 | 3,352,097 | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` |
| OpenCode | [`2026-06-02-opencode-only-fixed/opencode`](2026-06-02-opencode-only-fixed/opencode/) | 10/10 | $0.1753 | 805,731 | `gpt-5`, `gpt-5-mini` |

## Interpretation

All three selected artifacts are quality functional outputs: each produced the required
standalone game, tests, README, and passed the deterministic R1-R10 judge.

For the token/cost comparison, OpenCode is the clear outlier: it produced a 10/10 result
using roughly 24% of Codex's total tokens and about 9% of Claude's total tokens. Cost was
about 17x lower than the two frontier-direct runs.

## Caveat

This snapshot should be cited as a selected functional comparison, not as a clean single
all-tool batch run. Getting three different agents to all produce successful one-shot
outputs under identical rules took multiple attempts and harness fixes. That operational
friction is part of the result.
