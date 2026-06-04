# benchmarks/scripts

Helper scripts for running benchmarks consistently across coding-agent tools.

## benchmark-auto.ps1 -- primary automated runner

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark-auto.ps1                                         # default target: tic-tac-toe
.\benchmark-auto.ps1 -Benchmark markdown-editor              # one other target
.\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode  # one tool only
```

Runs a benchmark target without manual checkpoints. It reads `benchmarks/<target>/policy.json`, launches each enabled CLI non-interactively, captures raw stdout/stderr, snapshots `ccusage` before and after, pulls OpenCode cost from Cloudflare AI Gateway when tagged analytics are available, copies deliverables into `benchmarks/<target>/results/runs/<RunId>/<tool>/output/`, writes `_run-result.json`, and runs the deterministic Playwright judge.

On Windows, use a hidden process host for long unattended runs if you are working in the same desktop session. The runner launches tool subprocesses with hidden/no-shell process settings and invokes Claude with a strict empty MCP config so user/global MCP helpers cannot spawn extra console windows during the benchmark.

Policy modes:

- `tool`: validates requested model and expected outputs. `tic-tac-toe` uses this mode as the quick harness smoke test.
- `architecture`: also validates required model routing. `markdown-editor` uses this mode so OpenCode must show both `gpt-5` and the cheaper worker model for a valid tier-routing run.

Architecture-mode runs are evidence tests, not just output tests. If OpenCode produces a correct app without using the cheaper worker model, the run is invalid for the tier-routing claim even though the generated app may be useful.

Each tool is marked `valid: true` or `valid: false` in `_run-results.json`. Invalid runs keep their raw logs and outputs so failures can be audited instead of silently disappearing.

## benchmark.ps1 -- secondary guided/manual runner

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark.ps1                                              # default target: tic-tac-toe
.\benchmark.ps1 -Benchmark markdown-editor                   # one other target
.\benchmark.ps1 -Benchmark tic-tac-toe,markdown-editor       # several, in sequence
```

Guided orchestrator that wraps the three scripts below into one workflow. `-Benchmark` accepts a comma-separated list: each target runs end-to-end (start, tools, finish, judge-run, qualitative pass, summarize) before the next one begins, with a banner between them so it's clear which one you're on. Three phases, two manual checkpoints:

1. **Phase 1 -- start** (script): captures ccusage baselines for all configured tools, generates a RunId, prints per-tool launch instructions.
2. **Checkpoint A -- run the tools** (human): you launch each tool in its scratch dir, paste the prompt from PROMPT.md, let it work, exit. The orchestrator waits at a `Press ENTER to continue` prompt.
3. **Phase 2 -- finish + judge-run** (script): computes token deltas, runs the Playwright R1-R10 suite, captures screenshots, generates per-tool `judge-prompt-<tool>.md`.
4. **Checkpoint B -- qualitative pass** (human): paste each `judge-prompt-<tool>.md` into a multimodal coding agent of your choice; the agent fills in the 1-5 quality scores in `<tool>/judge.md`. Use the same agent across all tools for uniform bias.
5. **Phase 3 -- summarize** (script): prompts for the judge agent name, computes the composite ranking, appends the Final Summary to `<RunId>.md`.

**Auto-resume**: if you Ctrl+C or your terminal dies, re-run `benchmark.ps1`. It scans for in-progress runs, asks "Resume this one or start a new one?", and picks up at the next phase. State is detected from the on-disk artifacts (ccusage snapshots, `<RunId>.md`, `_judge-functional.json`, score completeness in each `judge.md`, final-summary marker), not from a separate state file.

The underlying scripts (`bench-run.ps1`, `judge-run.ps1`, `judge-summarize.ps1`) remain available for advanced/manual use -- their sections below describe their parameters. The orchestrator just glues them together so you don't have to remember the sequence or thread the RunId between commands.

## bench-run.ps1

Two-phase wrapper around `ccusage` plus Cloudflare AI Gateway cost capture for OpenCode. **One** `start` call sets up scratch directories and captures baselines for **every** tool configured at the top of the script. You then run each tool. After they've all finished, **one** `finish` call (with the same RunId) processes them all, computes deltas, pulls OpenCode Gateway cost when available, copies outputs into the repo, and stubs notes.md per tool.

For OpenCode, the `start` phase prefixes the printed launch command with `OPENCODE_APP_TAG=bench:<benchmark>:<RunId>`. The `finish` phase uses that same tag to filter Cloudflare AI Gateway analytics.

### Tool configuration

The list of tools is defined at the top of `bench-run.ps1`:

```powershell
$Tools = @(
    [PSCustomObject]@{ Name = "claude";   Launch = "claude" }
    [PSCustomObject]@{ Name = "codex";    Launch = "codex" }
    [PSCustomObject]@{ Name = "opencode"; Launch = "opencode --model openai-via-gateway/gpt-5" }
)
```

To add a new agent (e.g. a future Gemini CLI), add an entry — no parameter changes needed.

### Usage

```powershell
cd "C:\path\to\opencode-cloudflare-ai-gateway\benchmarks\scripts"

# Phase 1 -- ONE call. Captures baselines for ALL configured tools.
.\bench-run.ps1 -Phase start

# Script prints labeled instructions per tool, e.g.:
#
# CLAUDE
# ======
#   1. cd "<repo>\benchmarks\runs\<RunId>\claude"
#   2. claude
#   3. Paste the prompt from <repo>\benchmarks\tic-tac-toe\PROMPT.md
#   4. Let the agent run to completion
#
# CODEX
# =====
#   ... same pattern ...
#
# OPENCODE
# ========
#   ... same pattern ...
#
# AFTER ALL TOOLS FINISH
# ======================
#   & "<repo>\benchmarks\scripts\bench-run.ps1" -Phase finish -RunId <run-id>

# Phase 2 -- ONE call after every tool has exited. Processes all configured tools.
& "<repo>\benchmarks\scripts\bench-run.ps1" -Phase finish -RunId <run-id>

# To redo / process just one tool, add -Tool:
& "<repo>\benchmarks\scripts\bench-run.ps1" -Phase finish -RunId <run-id> -Tool opencode
```

### What it captures (per tool, in each tool's scratch dir)

| File | What it is |
|---|---|
| `_ccusage-before.json` / `.txt` | Full ccusage session list before the run |
| `_ccusage-after.json` / `.txt` | Same, after the run |
| `_gateway-cost.json` | OpenCode-only Cloudflare AI Gateway cost sidecar when Gateway analytics are available or queried |
| `_start-time.txt` / `_end-time.txt` | ISO timestamps |
| `_run-id.txt` | The RunId that ties this tool's session to its sibling tools' sessions |
| `_delta.json` | Computed delta: new sessions, totals, models used, wall clock |
| `_delta-summary.txt` | Human-readable version of the delta |

The finish phase copies all of these (plus the agent's generated files) into `benchmarks/<target>/results/runs/<RunId>/<Tool>/` and stubs a `notes.md` for human scoring.

### Parameters

- **`-Phase start | finish`** (required)
- **`-RunId <id>`** — required for finish. Start auto-generates `yyyy-MM-dd-HHmm` if omitted.
- **`-Tool <name>`** — optional. On finish, restricts processing to that one tool (useful when re-running). On start, ignored (start always sets up every configured tool).
- **`-BaseDir <path>`** — where scratch dirs live. Default: `<repo>/benchmarks/runs` (gitignored). Override if you want them elsewhere.
- **`-Benchmark <name>`** — folder under `benchmarks/` for results copy. Default: `tic-tac-toe`.
- **`-NoCopy`** — skip the copy-into-results step at finish.

### What it does NOT do

- **Doesn't launch the tool for you.** Each tool's REPL has its own permission flow that needs human eyes. The script prints exact commands.
- **Doesn't score against SPEC.md.** Quality scoring stays human — see the per-target SPEC.md.
- **Doesn't pull CF AI Gateway analytics.** For OpenCode runs, the gateway dashboard is the authoritative cost source; cross-check there.

### Requirements

- Node.js / npm (for `npx -y ccusage@latest`). bun works too if you'd rather use `bunx ccusage` — adapt the helper accordingly.
- PowerShell 7+.
- Each tool installed and reachable on `$PATH`.

### Troubleshooting

**"no new sessions detected" after finish:**
- Make sure the agent fully exited (some tools write their session log on exit).
- ccusage may not have indexed yet. Wait 30s and rerun finish (it overwrites the after-snapshot).
- Compare `_ccusage-before.json` and `_ccusage-after.json` directly to confirm.

**Models field empty in the summary:**
- ccusage's JSON shape varies by tool/version. Check the raw `_ccusage-after.json` for the actual field names.

**Quoted-path errors when pasting the finish command:**
- PowerShell requires the call operator `&` to invoke a quoted script path. The start phase's printed commands always include it.

## `judge-run.ps1` -- functional + qualitative judgment

Runs the two-layer judge against a completed benchmark run. Layer 1 is a deterministic Playwright suite (R1-R10). Layer 2 is a qualitative AI pass using a pre-substituted prompt template you paste into any multimodal agent.

### Pre-requirements (one-time)

```powershell
cd "<repo>\benchmarks\scripts\judge"
npm install
npx playwright install chromium
```

### Usage

```powershell
& "<repo>\benchmarks\scripts\judge-run.ps1" -RunId <run-id>
```

The script detects tool subdirectories under `benchmarks/<target>/results/runs/<RunId>/` automatically. No `-Tools` flag needed.

### What it produces

For each tool's directory (`results/runs/<RunId>/<tool>/`):

| File | What it is |
|---|---|
| `_judge-functional.json` | R1-R10 results, console errors, screenshot list |
| `_screenshots/empty.png` | Board on first load |
| `_screenshots/mid-game.png` | Board mid-game |
| `_screenshots/win.png` | Board after a win |
| `_screenshots/mobile.png` | Board at 375x812 viewport |
| `judge.md` | Pre-filled stub ready for qualitative agent pass |

At the RunId level (`results/runs/<RunId>/`):

| File | What it is |
|---|---|
| `<RunId>-judge.md` | Cross-tool R1-R10 grid + quality score placeholders |
| `judge-prompt-<tool>.md` | One file per tool -- JUDGE-PROMPT.md with all placeholders pre-substituted, ready to paste |

### Qualitative pass

After `judge-run.ps1` completes, you have one `judge-prompt-<tool>.md` file per tool. Launch any multimodal agent (with access to screenshots), paste the contents of one file, and let it fill in the soft scores (1-5 across quality dimensions) and observations in the corresponding `<tool>/judge.md`. Use the same agent for all tools in one RunId so the scoring bias is uniform. If you compare qualitative scores across RunIds where different agents judged, note which agent did the judging in each.

## `judge-summarize.ps1` -- final summary at the bottom of `<RunId>.md`

Parses each tool's `judge.md` after the qualitative pass is complete, computes a composite ranking, and appends a Final Summary section to `<RunId>.md`. Re-running the script replaces the existing block cleanly -- it is bounded by `<!-- JUDGE-SUMMARY-START -->` / `<!-- JUDGE-SUMMARY-END -->` sentinel markers, so the operation is idempotent.

### Usage

```powershell
& "<repo>\benchmarks\scripts\judge-summarize.ps1" -RunId <run-id> -JudgeAgent <name> [-Benchmark <name>]
```

`-JudgeAgent` is required -- it gets recorded in the methodology note inside the summary so the judging model is always traceable. Examples: `claude-opus-4-7`, `gpt-5 (via opencode)`.

### Composite ranking

Scores are weighted **cost 50% / quality 30% / bugs 20%**. Higher composite = better.

| Component | Formula | Perfect score |
|---|---|---|
| Cost score | `minCost / thisCost` | 1.0 (cheapest tool) |
| Quality score | `quality_avg / 5` | 1.0 (all 5s) |
| Bug score | `1 / (1 + bug_count)` | 1.0 (zero bugs) |

### Score parsing

The script supports both formats that `judge.md` files may use:

- Bullet form: `- Readability: 4`
- Table form: `| Readability | 4 | ... |`

### Guard rails

The script refuses to run if any tool's `judge.md` is missing scores -- it prints which dimension(s) are blank for which tool so you know exactly what still needs filling in.

### Files touched

Only `<RunId>.md`. The script does not modify `judge.md` files, `_judge-functional.json`, or any other artifact.
