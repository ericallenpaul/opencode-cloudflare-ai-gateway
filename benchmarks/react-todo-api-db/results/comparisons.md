# react-todo-api-db — comparisons log

Ranking across every benchmark run. One bullet per RunId. Each ranking reflects the human judgement after reviewing that run's per-tool `notes.md` against the SPEC.md acceptance criteria and quality dimensions.

For full per-run detail, open `runs/<RunId>/<tool>/notes.md`.

## Format

```
- <RunId> -- #1 <tool>, #2 <tool>, #3 <tool>  -- (optional one-line note)
```

The ranking is a composite of cost (ccusage), wall-clock time, and quality scoring (R1-R10 pass rate plus 1-5 quality dimensions). When the picture isn't clean — e.g. lowest cost wasn't highest quality — the note line should call that out.

## Runs

<!-- newest first -->

- 2026-05-31-164112 -- #1 opencode, #2 codex, #3 claude -- opencode 10/10 R1-R10 at $0.193 with a real `data/todos.sqlite3` file, ~8-10x cheaper than the frontier tools — clean win. codex 10/10 at $2.032 (`data/todos.sqlite`); claude 9/10 (R9 partial) at $1.580 (`data/todos.db`) — claude undercuts codex on cost but dropped one requirement, so 2nd/3rd is a quality-vs-cost call. First valid run after two shared-PROMPT.md clarifications applied identically to all three tools: (1) dependencies must install cleanly without `--force`/`--legacy-peer-deps` (earlier claude failed setup on a vite/@vitejs/plugin-react peer conflict); (2) the database must be a real on-disk SQLite file — in-memory engines like `sql.js` are forbidden (earlier opencode used sql.js and produced no db file, failing R5).
