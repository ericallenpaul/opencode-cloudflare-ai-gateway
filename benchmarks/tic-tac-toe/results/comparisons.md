# tic-tac-toe — comparisons log

Ranking across every benchmark run. One bullet per RunId. Each ranking reflects the human judgement after reviewing that run's per-tool `notes.md` against the SPEC.md acceptance criteria and quality dimensions.

For full per-run detail, open `runs/<RunId>/<tool>/notes.md`.

## Format

```
- <RunId> -- #1 <tool>, #2 <tool>, #3 <tool>  -- (optional one-line note)
```

The ranking is a composite of cost (ccusage), wall-clock time, and quality scoring (R1-R10 pass rate plus 1-5 quality dimensions). When the picture isn't clean — e.g. lowest cost wasn't highest quality — the note line should call that out.

## Runs

<!-- newest first -->

- 2026-05-22-0745 -- #1 opencode, #2 claude, #3 codex  -- opencode 10/10 R1-R10 at $0.25 (6-9x cheaper than the others); claude dropped to 9/10 (one regression) and got 45% cheaper run-over-run; codex stayed 10/10 but most expensive. Claude vs codex 2nd/3rd ordering flipped from run 1.
- 2026-05-21-0818 -- #1 opencode, #2 codex, #3 claude  -- all 10/10 R1-R10; opencode 10x cheaper than claude at identical functional outcome; qualitative scoring puts opencode 3.0/5 vs frontier tools 4.8/5 (real polish gap, but small per-tool cost difference doesn't justify the price).
