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

- 2026-05-21-0818 -- #1 opencode, #2 codex, #3 claude  -- all 10/10 R1-R10; opencode 10x cheaper than claude at identical functional outcome; qualitative AI scoring pending
