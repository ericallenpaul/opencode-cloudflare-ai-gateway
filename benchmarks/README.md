# Benchmarks

Reproducible benchmarks that measure **cost, time, and quality** of building the same project across three coding-agent tools, with their recommended plugin stacks. The point: turn the "is the tiered+gateway setup actually saving tokens?" question from claims into evidence.

## Headline result so far

Two completed runs of `tic-tac-toe`, identical prompt and acceptance criteria each time. Models: opencode ran GPT-5 via this repo's gateway stack; codex ran GPT-5 (CLI mis-reports as "gpt-5.5" in session records); claude ran claude-opus-4-7.

| Tool | Run 1 (05-21) cost / wall / R1-R10 | Run 2 (05-22) cost / wall / R1-R10 | Quality avg (run 1 / run 2) |
|---|---|---|---|
| **opencode** | $0.28 / 5m18s / 10/10 | $0.25 / 7m02s / 10/10 | 3.0 / 3.2 |
| codex | $1.97 / 9m48s / 10/10 | $2.18 / 11m06s / 10/10 | 4.8 / 4.6 |
| claude | $2.91 / 9m34s / 10/10 | $1.60 / 8m56s / 9/10 | 4.8 / 4.4 |

**Effective Input** (per-run details linked below) = `inputTokens + cacheReadTokens + cacheWriteTokens` -- what the model actually saw, normalized across tools with different caching strategies.

What stayed stable: opencode is cheapest by 6-10x in both runs, opencode and codex both held 10/10 functional R1-R10 both runs, opencode held composite rank #1 both runs. Frontier tools scored higher on quality (~4.4-4.8 vs opencode ~3.0-3.2).

Where the numbers didn't stay stable run-over-run (the kind of nondeterminism the methodology warns about): claude got 45% cheaper but dropped one functional criterion, and claude vs codex flipped 2nd/3rd on the composite ranking as a result.

Full per-run data: [`runs/2026-05-21-0818`](tic-tac-toe/results/runs/2026-05-21-0818/2026-05-21-0818.md), [`runs/2026-05-22-0745`](tic-tac-toe/results/runs/2026-05-22-0745/2026-05-22-0745.md). Cross-run ranking log: [`tic-tac-toe/results/comparisons.md`](tic-tac-toe/results/comparisons.md). See "Caveats and limitations" below before citing any of these numbers.

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

## How we've iterated the opencode config

This repo is a working OSS reference setup, not a one-shot publication. The benchmark exists to surface gaps in the agent configuration, and the gaps then get fixed. Every change to the opencode build-agent prompt or to the example MCP set is committed with a stated reason and is traceable to the benchmark observation that motivated it. **The benchmark itself -- SPEC.md, PROMPT.md, the R1-R10 Playwright assertions -- has never changed between runs.** The line we hold is *tune the tool, not the test.* Every completed run is published in the relevant `comparisons.md` -- including the ones where opencode underperformed -- so a reader can audit the lineage rather than take a single cherry-picked run on faith.

Config versions to date (each `comparisons.md` entry tags which version a run used):

- **Config v1 (baseline)**: LSP nudge + superpowers skill reference, no deliverable-discipline rules. Used for `tic-tac-toe` runs `2026-05-21-0818` and `2026-05-22-0745`, and `markdown-editor` run `2026-05-22-0837`. The markdown-editor run under v1 exposed: opencode placed tests in a `tests/` subdirectory (cost R9 and R10 even though the tests passed), wrote a one-line README, and the verification-before-completion skill didn't catch the test-location issue because it didn't actually run `node --test`.
- **Config v2 (deliverable-discipline)**: explicit prompt rules added -- "place files at root, do not nest in subdirectories" plus an abstract rule about README sections. Commit [`9b592ac`](../../../commit/9b592ac). Used for `markdown-editor` run `2026-05-22-0951`. Result: the file-layout rule landed cleanly (R9/R10 went FAIL -> PASS, opencode hit 10/10 functional), but the abstract README rule did NOT land -- opencode shipped a byte-identical one-line README to the previous run. The lesson, documented in [LEARNINGS.md](../docs/LEARNINGS.md): concrete mechanically-verifiable rules land, abstract content-quality rules don't.
- **Config v3 (template-driven README + Playwright MCP)**: replaced the abstract README rule with a concrete template (exact list of section headings, minimum line count, minimum sentence count per section) AND promoted Playwright MCP from "recommended optional" to a shipping default so the agent can self-verify HTML/JS deliverables in a real browser. Commits [`f6998a7`](../../../commit/f6998a7) and [`668038c`](../../../commit/668038c). Used for `markdown-editor` run `2026-05-24-0758`. **Result: the template-driven README rule did NOT land** -- opencode shipped another one-line README despite the now-mechanically-verifiable rule (named sections, min line count). Two abstract-to-concrete iterations have now failed. Documentation quality scored 1/5 again. The Playwright MCP self-verification half is harder to assess: opencode shipped a working app (10/10 R1-R10) and its inline JS rendered fine, so we can't tell if it actually invoked the MCP or just got lucky. Claude (which does not ship Playwright MCP) shipped a `</script>`-termination bug that broke runtime rendering -- a real browser smoke-test would have caught it. The lesson reinforces v2's: **even concrete prompt rules can fail to land if the agent does not surface the rule as a checked precondition.** The proposed run-4 change is to make the README rubric *scored* inside SPEC.md (each of 4 sections worth 1 quality point, all-or-nothing) so the agent's quality grade visibly depends on it, rather than relying on a prompt-side instruction the agent may or may not internalize. Also: tighten the verification step to *explicitly* require a Playwright MCP browser smoke-test (assert no console errors + preview non-empty after typing `# Hello`), and add a codex-CLI preflight to `bench-run.ps1` (run 3 lost the codex data point to silent token exhaustion).
- **Config v4 (scored README rubric + explicit Playwright smoke-test + CLI preflight)**: three changes informed by `markdown-editor` run `2026-05-24-0758`. (1) Documentation becomes a counted 0-5 rubric inside `SPEC.md` and `JUDGE-PROMPT.md` (one point per required README section) so the score is mechanical and the agent's quality grade visibly depends on README depth, rather than a prompt-side instruction the agent can ignore. (2) The opencode build-agent prompt now requires an explicit five-step Playwright MCP smoke-test for every HTML deliverable (navigate / snapshot / type / console-check / non-empty assertion), with no wiggle room and explicit instructions to HALT if the MCP is unavailable -- targets the class of bug claude shipped in run 3 (a `</script>` literal inside inline JS that killed runtime rendering, undetected by source-code review). (3) `bench-run.ps1` start phase now runs a CLI version-check preflight against each configured tool and prompts before proceeding if any tool is unreachable -- closes the silent codex token-exhaustion failure mode that wasted a run-3 data point. Hypothesis being tested for the next markdown-editor run: a scored rubric closes the documentation gap that two prompt-side iterations could not; the explicit smoke-test catches `</script>`-class bugs before claude can ship them; the preflight prevents the codex skip from recurring.

A reader who's skeptical that we're tuning to make opencode look better can verify directly: the SPEC and PROMPT and Playwright assertions are byte-identical across all runs (check the git history). What changes between versions is only the agent's instructions about how to follow them. That's the legitimate direction of iteration -- improving an agent setup against a fixed bar -- not training to the test.

## Current benchmark targets

- [tic-tac-toe](tic-tac-toe/) -- standalone HTML tic-tac-toe, ~200-400 lines, exercises plan/execute/verify with bounded scope. **Status: first run complete (RunId `2026-05-21-0818`, all tools 10/10).**
- [markdown-editor](markdown-editor/) -- standalone HTML markdown editor with live preview, ~300-500 lines, exercises parser design and XSS defensiveness. **Status: three runs complete (`2026-05-22-0837` under opencode config v1, `2026-05-22-0951` under config v2, `2026-05-24-0758` under config v3).** Run v2 fixed the file-layout discipline (opencode 10/10 functional) but not README depth. Run v3 added template-driven README and Playwright MCP self-verification; opencode held 10/10 functional and is 6.9x cheaper than claude this run, **but the README rule did not land for the second iteration in a row** (Documentation still 1/5). Codex was skipped in run 3 due to mid-benchmark API token exhaustion. Claude shipped a `</script>`-termination bug that killed runtime rendering (4/10 R1-R10). See [comparisons.md](markdown-editor/results/comparisons.md) and "How we've iterated the opencode config" above.

## Adding a new benchmark target

Targets are discovered by convention -- no central registry to update. A target is any directory under `benchmarks/` containing a `PROMPT.md`. To add one called `<target>` (use kebab-case):

```
benchmarks/<target>/
├── PROMPT.md            # required -- canonical prompt fed to every tool, verbatim
├── SPEC.md              # required -- R1-R10 acceptance criteria + quality dimensions
├── METHODOLOGY.md       # optional -- run-procedure notes; falls back to a default if absent
└── results/             # script-managed (auto-created on first run)
    ├── README.md        # optional, describes the layout to readers
    ├── comparisons.md   # optional, hand-maintained ranking log
    └── runs/            # populated by bench-run + judge-run + judge-summarize

benchmarks/scripts/judge/tests/<target>.spec.js   # required -- Playwright R1-R10 suite
```

The spec file name MUST match the target directory name exactly (kebab-case included). The judge subsystem uses `tests/<target>.spec.js` directly -- there is no map to edit.

**Why the Playwright spec lives outside the target dir**: it needs to `import` from `@playwright/test`, which only resolves under `benchmarks/scripts/judge/` where `npm install` ran. Keeping the spec in `tests/` avoids needing per-target node_modules.

**Easiest path** when adding a target: copy `benchmarks/tic-tac-toe/` to `benchmarks/<your-target>/`, copy `benchmarks/scripts/judge/tests/tic-tac-toe.spec.js` to `tests/<your-target>.spec.js`, then rewrite both for your target's app. Once those files exist, `benchmark.ps1 -Benchmark <your-target>` works end-to-end.

## See also

- [`docs/PROBLEM.md`](../docs/PROBLEM.md) — the cost-tier thesis these benchmarks are evidence for
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — the OpenCode-side stack being measured
- [ccusage](https://github.com/ryoppippi/ccusage) — the token-tracking tool, supports Claude Code / Codex CLI / OpenCode
