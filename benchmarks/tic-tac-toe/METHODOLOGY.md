# Tic-Tac-Toe — run methodology

The current primary path is the unattended `benchmark-auto.ps1` runner. The older
manual `bench-run.ps1` flow is still documented below for debugging and historical
runs.

## Prerequisites

See [`../README.md`](../README.md) for the full list. Quick check:

```powershell
node --version          # 18+ for npx ccusage
pwsh --version          # PowerShell 7+
claude --version        # whichever coding agents you want to compare,
codex --version         # all reachable on $PATH
opencode --version
```

For OpenCode specifically: confirm `$env:CF_ACCOUNT_ID`, `$env:CF_GATEWAY_NAME`, `$env:CF_AIG_TOKEN`, `$env:OPENCODE_EXPERIMENTAL_LSP_TOOL` are set in your shell.

Also: at least one prior session per tool helps ccusage's baseline diff. If a tool has never been run on this machine, the "before" snapshot will be empty — that still works, but you won't be able to confirm baseline integrity.

## Run procedure

The simplest current path: **one automated command runs the selected tool(s), copies
outputs, and runs the deterministic judge.**

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools claude,codex,opencode -RunId <RunId>
```

For one tool:

```powershell
.\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode -RunId <RunId>
```

On Windows, unattended runs should be launched from a hidden process host when the
operator is using the same desktop session for other work. The runner itself starts
tool subprocesses with `CreateNoWindow = true`, `UseShellExecute = false`, redirected
stdout/stderr, and `pwsh -NoProfile`. Claude is invoked with `--strict-mcp-config`
and an empty benchmark-local MCP config so user/global MCP helpers such as `npx`,
Snyk, or Context7 do not spawn extra console windows during benchmark execution.

The selected 2026-06-02 `tic-tac-toe` publication snapshot is intentionally documented
as selected successful artifacts rather than a single uninterrupted all-tool batch.
Several same-day attempts exposed real operational nondeterminism across agent CLIs,
plugins, and LLMs. See
[`results/runs/2026-06-02-selected-functional.md`](results/runs/2026-06-02-selected-functional.md).

The legacy guided path: **one orchestrator command runs everything with two manual pauses.**

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark.ps1
```

That wraps the three scripts below into a guided workflow, threading the RunId automatically and pausing at the two checkpoints (run-the-tools / fill-in-qualitative-scores). Auto-resumes if interrupted -- re-run the same command and choose "Resume". See [`../scripts/README.md`](../scripts/README.md) for details.

The sections below describe the underlying phases for when you need to drive them individually (debugging, re-running a single phase, etc.).

### 1. Start phase — one call

```powershell
cd "<repo>\benchmarks\scripts"
.\bench-run.ps1 -Phase start
```

This:
- Generates a `RunId` like `2026-05-21-1730`
- Creates `<repo>\benchmarks\runs\<RunId>\{claude,codex,opencode}\` scratch dirs (gitignored)
- Snapshots ccusage baselines into each scratch dir
- Prints labeled per-tool instructions and one shared finish command

### 2. Run each tool

Open three terminals (or run them serially — your call). For each tool, follow the printed block:

```
TOOL
====
  1. cd "<scratch-dir>"
  2. <launch command>
  3. Paste the prompt from <repo>\benchmarks\tic-tac-toe\PROMPT.md
  4. Let the agent run to completion
```

**While the agent runs**: approve permission prompts but don't volunteer guidance. If a tool's plugins (e.g. superpowers `writing-plans`) pause for input, answer with a single word ("yes" / "proceed") so the pause is bounded. The point is to measure autonomous capability — typing speed shouldn't inflate the time metric. `brainstorming` is intentionally excluded by the canonical prompt.

Note the order you run them in (first/second/third) — you'll record this in `notes.md` so anyone replicating can control for run-order effects.

### 3. Finish phase — one call

After every tool's agent has exited:

```powershell
& "<repo>\benchmarks\scripts\bench-run.ps1" -Phase finish -RunId <RunId>
```

This:
- Snapshots ccusage post-state for each tool
- Determines each tool's **end time** (more on this below)
- Computes deltas (input/output/cache tokens, cost, wall clock, models used)
- Copies agent output → `benchmarks/tic-tac-toe/results/runs/<RunId>/<tool>/output/`
- Stubs `notes.md` per tool with metrics pre-filled
- Best-effort copies session transcripts (Claude: `~/.claude/projects/<encoded>`, Codex: `~/.codex/sessions/`, OpenCode: manual via `opencode export`)
- Prints a summary table and "view your result" hints

If a tool didn't run (you skipped one), it's silently skipped at finish — no harm.

#### How end time is detected

Because finish runs once for all tools but the tools finish at different times, using "now" as the end time would inflate wall-clock for whichever tool finished first. The script falls back through three sources, in order:

1. **ccusage session timestamp** — the latest `lastUpdated` / `endTime` / `lastActivity` field on the new session in the post-run snapshot. This is the truest signal: ccusage logs the time of the last LLM response.
2. **Newest agent-written file mtime** — the most recent file in the scratch dir that doesn't start with `_` (i.e. anything the agent wrote — `tictactoe.html`, the test file, etc.). Good approximation as long as the agent's last action was a file write.
3. **Current time, with a warning** — only if both above fail (rare; means the agent produced nothing and ccusage has no timestamp). Wall-clock will overestimate.

The source used is printed during finish and recorded both in `_end-time-source.txt` and in the stubbed `notes.md` under "End-time source". If the metric looks wrong for a particular tool, that line tells you why and you can edit `_end-time.txt` manually before re-running finish (which will recompute the delta).

### 4. Functional judging -- judge-run.ps1

```powershell
& "<repo>\benchmarks\scripts\judge-run.ps1" -RunId <RunId>
```

Runs the deterministic Playwright suite (R1-R10) against each tool's output, captures screenshots, stubs each `<tool>/judge.md` with R1-R10 results pre-filled, and generates one `judge-prompt-<tool>.md` per tool for the qualitative pass. See [`../scripts/README.md`](../scripts/README.md) for full parameter reference.

### 5. Qualitative judging -- human step

Launch any multimodal coding agent of your choice inside the repo, paste the contents of each `judge-prompt-<tool>.md`, and let it fill in the 1-5 quality scores and bug list in the corresponding `<tool>/judge.md`. Use the SAME judging agent for all tools within one RunId -- switching agents mid-run introduces scoring bias. This is a human-driven step; the pipeline pauses here until all `judge.md` files are complete.

### 6. Final summary -- judge-summarize.ps1

```powershell
& "<repo>\benchmarks\scripts\judge-summarize.ps1" -RunId <RunId> -JudgeAgent <name>
```

Parses each tool's `judge.md`, computes a composite ranking weighted cost 50% / quality 30% / bugs 20%, and appends a Final Summary section to `<RunId>.md`. Pass `-JudgeAgent` with the name of the model that did the qualitative pass (e.g. `claude-opus-4-7`) so it is recorded in the methodology note. The script is idempotent -- re-running replaces the existing summary block cleanly.

### 7. Optional: add a ranking line to comparisons.md

Open [`results/comparisons.md`](results/comparisons.md) and add a bullet under "Runs":

```
- 2026-05-21-1730 -- #1 codex, #2 opencode, #3 claude  -- claude burned 4x cost for same R1-R10
```

This is the cross-RunId ranking log. When the picture isn't clean (e.g. cheapest wasn't best), the trailing note should call that out.

## Reproducibility & honest disclosure

These benchmarks are not lab-grade. Real confounds:

- **Model nondeterminism** — same prompt produces different output across runs even at temperature 0. Run 2-3 RunIds and look at median behavior, not a single point.
- **Plugin state** — claude-mem persists context across sessions. Runs aren't clean rooms. Note plugin state in notes.md.
- **Provider latency** — varies by time of day. Run all three tools within a single window so the time comparison is fair.
- **Prompt phrasing** — not tuned per tool. A prompt that's great for Claude may underperform on Codex. That's part of what we're measuring.

## CF Gateway analytics cross-check (OpenCode only)

OpenCode runs route through CF AI Gateway. After finish, open https://dash.cloudflare.com/&lt;account&gt;/ai/ai-gateway/&lt;gateway&gt;/analytics, filter by your `user` metadata tag and the RunId date window, and screenshot the panel. Save to `results/runs/<RunId>/opencode/_cf-gateway-analytics.png`. The gateway numbers are authoritative for billable cost; ccusage's numbers come from OpenCode's local session DB. They should match within a few percent.
