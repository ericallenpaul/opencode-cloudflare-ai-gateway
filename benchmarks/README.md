# Benchmarks

Reproducible benchmarks that measure **cost, time, and quality** of building the same project across three coding-agent tools, with their recommended plugin stacks. The point: turn the "is the tiered+gateway setup actually saving tokens?" question from claims into evidence.

## Headline result so far

RunId `2026-05-21-0818` -- tic-tac-toe. All three tools passed all 10 functional acceptance criteria (R1-R10, Playwright-verified).

| Tool | Wall | Cost (USD) | Effective Input | Output | Model | R1-R10 |
|---|---:|---:|---:|---:|---|---:|
| opencode | 5m 18s | $0.28 | 622K | 10.9K | gpt-5 | 10/10 |
| codex | 9m 48s | $1.97 | 1.38M | 26.6K | gpt-5 (mis-reported as "gpt-5.5" in session records) | 10/10 |
| claude | 9m 34s | $2.91 | 3.25M | 30.9K | claude-opus-4-7 | 10/10 |

**Effective Input** = `inputTokens + cacheReadTokens + cacheWriteTokens` -- what the model actually saw, normalized across tools with different caching strategies. See "Caveats and limitations" below before drawing conclusions from these numbers.

Full data: [`tic-tac-toe/results/runs/2026-05-21-0818/2026-05-21-0818.md`](tic-tac-toe/results/runs/2026-05-21-0818/2026-05-21-0818.md).

## Prerequisites

- **Node.js / npm** — `bench-run.ps1` shells out to `npx -y ccusage@latest`. Node 18+ is fine; npm pulls and caches ccusage on first call. (Alternatively, install ccusage globally: `npm i -g ccusage`.)
- **PowerShell 7+** (`pwsh`) — the wrapper script is written for it.
- **The coding agents you want to compare** — `claude`, `codex`, and `opencode` on your `$PATH`. Each tool's session log is read by ccusage from its standard local path; if you've never run a tool before, the script's baseline snapshot will be empty (still works, just no "before" history).
- **Optional: bun** — `bunx ccusage` works in place of `npx` if you have it.

Scratch directories created by the script live in `benchmarks/runs/` inside this repo, which is gitignored. The curated, committed copies of each run live under `benchmarks/<target>/results/runs/`.

## What's measured

For each benchmark target, each tool runs the same prompt against the same acceptance criteria. We capture:

| Metric | Source |
|---|---|
| Input tokens | [ccusage](https://github.com/ryoppippi/ccusage) (tracks all three tools) + CF AI Gateway analytics for OpenCode runs |
| Output tokens | same |
| Cost ($) | same |
| Wall-clock time | timestamp at prompt → final assistant response |
| Tool invocations (count, by name) | session transcript |
| Skills invoked (which, how many times) | session transcript |
| Files written / read | session transcript |
| Final quality | tests pass? acceptance criteria met? subjective UX score |
| Plugin stack active | recorded per run |

## Tools being compared

All three use [obra/superpowers](https://github.com/obra/superpowers) so the prompt sequence (brainstorm → plan → TDD → verify) is portable across them.

| Tool | Plugin stack |
|---|---|
| **Claude Code** | claude-mem (memory persistence), context-mode (context window optimization), superpowers, MCPs (snyk, cloudflare, etc.) — Eric's daily setup, unchanged |
| **Codex CLI** | Whatever Codex CLI is configured with locally; superpowers via the `npx -y skills add cloudflare/skills --skill '*' --yes --global` install per CF agent-setup docs |
| **OpenCode** | This repo's full stack: tiered models via CF AI Gateway, LSP integration (with `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`), context7 + cloudflare-docs + snyk MCPs, obra/superpowers, per-agent LSP-and-superpowers prompt nudges |

**Fairness note**: we intentionally do NOT strip plugins for these runs. The benchmark question is "how does each tool perform in its *recommended* configuration" — not "how does each tool perform naked." Each tool's plugin stack is captured in the per-run notes so readers can see what they're comparing.

## The two layers

Benchmarking has two distinct layers, each handled by a separate script.

**Layer 1 -- deterministic functional scoring (`bench-run.ps1` + `judge-run.ps1` Playwright tests)**

`bench-run.ps1` handles the cost and time capture: it snapshots ccusage before and after each tool run, computes deltas, and writes per-tool metric files. `judge-run.ps1` handles functional correctness: it runs a Playwright suite (R1-R10) against each tool's HTML output, producing `_judge-functional.json` and screenshots for each tool, plus a cross-tool `<RunId>-judge.md` summary. These two layers together give you objective numbers -- what the tool cost, how long it took, and whether its output passes the acceptance criteria.

**Layer 2 -- qualitative AI judgment (`JUDGE-PROMPT.md`)**

R1-R10 tells you whether the app works. It doesn't tell you whether the code is clean, whether the UX is polished, or whether the approach was sensible. The qualitative layer uses `benchmarks/scripts/judge/JUDGE-PROMPT.md`: `judge-run.ps1` pre-substitutes the placeholders and writes one `judge-prompt-<tool>.md` file per tool. You paste that into any multimodal agent of your choice; it fills in soft scores (1-5 across several dimensions) and observations in the corresponding `<tool>/judge.md`. Use the same agent for all tools in one RunId so the scoring bias is uniform.

## How to run a benchmark

Each benchmark target lives in its own subdirectory (e.g. `tic-tac-toe/`) with:

- `PROMPT.md` — the canonical prompt fed to each tool, verbatim
- `SPEC.md` — what the finished app must do (acceptance criteria + test expectations)
- `METHODOLOGY.md` — exact run steps, fairness notes, what to capture
- `results/runs/<RunId>/<tool>/` — outputs from each tool in each run
- `results/comparisons.md` — hand-maintained ranking log across runs

**The simple path: one orchestrator command, two manual pauses.**

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark.ps1                                              # tic-tac-toe (default)
.\benchmark.ps1 -Benchmark markdown-editor                   # any other target
.\benchmark.ps1 -Benchmark tic-tac-toe,markdown-editor       # several in sequence
```

`benchmark.ps1` wraps the three lower-level scripts (`bench-run.ps1`, `judge-run.ps1`, `judge-summarize.ps1`) into a single guided workflow:

1. **Phase 1 -- start** (script): captures ccusage baselines for every configured tool, generates a RunId, prints per-tool launch instructions.
2. **Checkpoint A** (human): you launch each tool in its scratch dir, paste the prompt from `PROMPT.md`, let it work, exit. The orchestrator waits at `Press ENTER to continue`.
3. **Phase 2 -- finish + judge-run** (script): computes token deltas, runs the deterministic Playwright R1-R10 suite, captures screenshots, generates per-tool `judge-prompt-<tool>.md`.
4. **Checkpoint B** (human): paste each `judge-prompt-<tool>.md` into a multimodal coding agent of your choice; the agent fills in 1-5 quality scores in each `<tool>/judge.md`. Use the same agent across all tools so scoring bias is uniform.
5. **Phase 3 -- summarize** (script): prompts for the judge agent name, computes the composite ranking (cost 50% / quality 30% / bugs 20%), appends the Final Summary block to `<RunId>.md`.

**Auto-resume**: if anything interrupts the orchestrator (Ctrl+C, terminal close), re-run `benchmark.ps1`. It detects the in-progress run on disk and asks "Resume this one or start fresh?" -- no separate state file, the artifacts themselves are the state.

The lower-level scripts remain available for advanced cases (re-running just one phase, debugging). See [`scripts/README.md`](scripts/README.md) for their parameters, and [`tic-tac-toe/METHODOLOGY.md`](tic-tac-toe/METHODOLOGY.md) for the full play-by-play of each phase. Optional: add a bullet to `results/comparisons.md` with your ranking as a cross-RunId log.

## Reproducibility limits (honest disclosure)

These benchmarks are not lab-grade controlled experiments. Real confounds:

- **Model nondeterminism** -- same prompt produces different outputs across runs even at temperature 0. Run each tool 2-3 times and take median or best.
- **Plugin state** -- claude-mem persists context across sessions. A run that benefits from prior session memory isn't comparable to a fresh-install run. We don't reset between runs (Eric's preference: real-world setup). Note plugin state per run.
- **Time-of-day** -- provider latency varies. Run all tools within a single window for fair time comparison.
- **Prompt phrasing** -- the canonical prompt has not been tuned per tool. A prompt that works well for one tool may underperform on another. That's part of what we're measuring.

We publish the methodology and raw transcripts so readers can decide how much weight to put on the numbers.

## Caveats and limitations

These are real fairness and measurement limitations. Don't ignore them when citing numbers from this repo.

1. **Different models per tool.** The first run used claude-opus-4-7 for Claude Code, GPT-5 for Codex CLI, and GPT-5 for OpenCode. Opus 4.7 costs roughly 5x Sonnet per token. The benchmark question is "each tool in its recommended configuration" -- that's intentional -- but a cost comparison that held model constant would tell a different story.

2. **Different plugin stacks per tool.** Claude Code ran with claude-mem + context-mode + superpowers v5.1.0 + MCPs (snyk, context7, cloudflare-docs). Codex ran base + superpowers via cloudflare/skills. OpenCode ran this repo's full tiered stack + LSP + MCPs + per-agent prompt nudges. Plugin overhead inflates Claude's effective input: claude-mem pre-loads a memory blob on the first turn. "OpenCode is cheaper" partly reflects "OpenCode's stack uses less startup context," not only "cheaper models." This is not unfair -- it's how each tool actually runs for users -- but it should be understood.

3. **ccusage cost is API-retail-equivalent.** It computes what you would pay if billed by token at public API rates. If you're on Claude Pro/Max, actual cost is a flat subscription fee. If using BYOK through the Cloudflare gateway, actual cost is whatever the upstream provider charged. The retail-equivalent figure normalizes across billing models but is not what shows up on your card.

4. **Codex CLI mis-reports its model name.** Session records show `"gpt-5.5"` instead of `"gpt-5"`. ccusage propagates the name as-is. The actual model is GPT-5. Cosmetic, but worth noting.

5. **End-time detection is approximated.** The session-window filter uses newest agent file mtime + 5 minutes as the benchmark window's upper bound. For tools whose last action isn't a file write, this could under-estimate the window by a few minutes.

6. **Judge agent bias.** The qualitative AI layer uses whatever agent you pick. Different agents score differently. Use the same judging agent for all tools within one RunId so at least the bias is uniform. If comparing qualitative scores across different RunIds, note which agent judged each.

7. **Cross-tool Playwright selectors may need updates.** The selector-agnostic helper uses a priority chain (role=gridcell -> data-idx -> data-index -> data-cell-index -> first 9 board children) that handled the three tested DOMs. A future tool's output could break these assumptions and require helper updates. The R4 draw-sequence test also assumes row-major cell order; a column-major implementation would spuriously fail.

8. **One RunId is one data point.** Model nondeterminism can shift cost and time by 10-30% across identical re-runs. Treat any single RunId as evidence of direction, not as a published benchmark result. The `comparisons.md` files are structured to accumulate rankings across multiple runs so patterns can emerge over time.

## Current benchmark targets

- [tic-tac-toe](tic-tac-toe/) -- standalone HTML tic-tac-toe, ~200-400 lines, exercises plan/execute/verify with bounded scope. **Status: first run complete (RunId `2026-05-21-0818`, all tools 10/10).**
- [markdown-editor](markdown-editor/) -- standalone HTML markdown editor with live preview, ~300-500 lines, exercises parser design and XSS defensiveness. **Status: scaffold ready, runs pending.** Designed to expose differences between cheap and frontier models that tic-tac-toe is too simple to surface.

## See also

- [`docs/PROBLEM.md`](../docs/PROBLEM.md) — the cost-tier thesis these benchmarks are evidence for
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — the OpenCode-side stack being measured
- [ccusage](https://github.com/ryoppippi/ccusage) — the token-tracking tool, supports Claude Code / Codex CLI / OpenCode
