# tic-tac-toe — comparisons log

Ranking across every benchmark run. One bullet per RunId. Each ranking reflects the human judgement after reviewing that run's per-tool `notes.md` against the SPEC.md acceptance criteria and quality dimensions.

For full per-run detail, open `runs/<RunId>/<tool>/notes.md`.

## Format

```
- <RunId> -- #1 <tool>, #2 <tool>, #3 <tool>  -- (optional one-line note)
```

The ranking is a composite of cost (ccusage), wall-clock time, and quality scoring (R1-R10 pass rate plus 1-5 quality dimensions). When the picture isn't clean — e.g. lowest cost wasn't highest quality — the note line should call that out.

## Runs

<!-- newest first. Each entry notes the opencode config version in effect for the run (v1, v2, v3, ...) so the lineage between prompt changes and benchmark results is auditable. See `../../README.md` "How we've iterated the opencode config" for the version table. -->

- 2026-06-02 selected functional snapshot -- #1 opencode, #2 codex, #3 claude for cost/token efficiency -- all three selected artifacts are 10/10 R1-R10 functional passes under the same tic-tac-toe prompt/spec/judge. Source artifacts: claude from corrected rerun [`2026-06-02-140953-claude-fixed`](runs/2026-06-02-140953-claude-fixed/), codex from [`2026-06-02-140953`](runs/2026-06-02-140953/), opencode from [`2026-06-02-opencode-only-fixed`](runs/2026-06-02-opencode-only-fixed/). Token/cost snapshot: opencode $0.1753 / 805,731 tokens, codex $3.0120 / 3,352,097 tokens, claude $3.0039 / 8,942,555 tokens. This is the publishable functional comparison, but not a single uninterrupted all-tool batch: same-day attempts exposed the real operational caveat that different agent CLIs/plugins/LLMs are hard to make behave consistently enough for one-shot benchmark publication. See [`runs/2026-06-02-selected-functional.md`](runs/2026-06-02-selected-functional.md).
- 2026-05-22-0745 -- (opencode config v1: baseline) #1 opencode, #2 claude, #3 codex  -- opencode 10/10 R1-R10 at $0.25 (6-9x cheaper than the others); claude dropped to 9/10 (one regression) and got 45% cheaper run-over-run; codex stayed 10/10 but most expensive. Claude vs codex 2nd/3rd ordering flipped from run 1.
- 2026-05-21-0818 -- (opencode config v1: baseline) #1 opencode, #2 codex, #3 claude  -- all 10/10 R1-R10; opencode 10x cheaper than claude at identical functional outcome; qualitative scoring puts opencode 3.0/5 vs frontier tools 4.8/5 (real polish gap, but small per-tool cost difference doesn't justify the price).
