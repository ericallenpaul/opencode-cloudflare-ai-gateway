# Benchmarks

Reproducible benchmarks that measure **cost, time, and correctness** across Claude Code, Codex CLI, and this OpenCode configuration. The point is no longer just "does a cheaper model save money?" That question was too shallow. The current benchmark question is:

> Can a frontier orchestrator plus right-sized workers produce correct output at lower cost than frontier-direct tools?

The harness is intentionally strict. It records model evidence, invalidates missing routing, captures command-line tests, runs deterministic browser checks, and preserves raw logs so a cheap run cannot pass merely by producing files.

For the reader-facing result summary across all published benchmark targets, start with [`RESULTS.md`](RESULTS.md). This file documents the harness, methodology, scripts, and historical config iterations.

## Publication snapshot

The current publishable snapshot has at least one successful functional comparison for each benchmark target. The goal of this snapshot is not to prove that every agent succeeds on every attempt. It is to compare cost and token use for quality outputs after each tool has produced a result that satisfies the same target prompt, SPEC, and deterministic judge.

| Benchmark | Selected artifact(s) | Claude Code | Codex CLI | OpenCode |
|---|---|---:|---:|---:|
| `markdown-editor` | [`2026-05-26-0829`](markdown-editor/results/runs/2026-05-26-0829/) | 9/10 | 10/10 | 10/10 |
| `react-todo-api-db` | [`2026-05-31-164112`](react-todo-api-db/results/runs/2026-05-31-164112/) | 9/10 | 10/10 | 10/10 |
| `tic-tac-toe` | [selected 2026-06-02 artifacts](tic-tac-toe/results/runs/2026-06-02-selected-functional.md) | 10/10 | 10/10 | 10/10 |

The final `tic-tac-toe` token/cost snapshot is the cleanest structured comparison:

| Tool | Source artifact | Cost | Total tokens | Functional result |
|---|---|---:|---:|---:|
| **OpenCode** | [`2026-06-02-opencode-only-fixed`](tic-tac-toe/results/runs/2026-06-02-opencode-only-fixed/) | **$0.1753** | **805,731** | 10/10 |
| Claude Code | [`2026-06-02-140953-claude-fixed`](tic-tac-toe/results/runs/2026-06-02-140953-claude-fixed/) | $3.0039 | 8,942,555 | 10/10 |
| Codex CLI | [`2026-06-02-140953`](tic-tac-toe/results/runs/2026-06-02-140953/) | $3.0120 | 3,352,097 | 10/10 |

That result supports the current recommendation: `gpt-5` remains the OpenCode build/orchestration tier, `gpt-5-mini` is the implementation worker tier, and GLM 4.7 Flash remains useful for bounded read/search/planning work but not for the harder implementation target. OpenCode produced the selected successful `tic-tac-toe` output at roughly 17x lower cost than Claude/Codex and with materially fewer total tokens.

The caveat is important enough to lead with: getting three different agent CLIs, plugin stacks, and LLMs to produce successful one-shot outputs consistently took days of harness work and reruns. The June 2 `tic-tac-toe` publication row is therefore a selected functional comparison, not a clean single uninterrupted all-tool batch run. That operational friction is part of the benchmark result.

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

The current runs compare each tool in its intended best-orchestrator setup. We do not force all tools onto the same model because that would answer a different question.

| Tool | Plugin stack |
|---|---|
| **Claude Code** | claude-mem (memory persistence), context-mode (context window optimization), superpowers, MCPs (snyk, cloudflare, etc.) — Eric's daily setup, unchanged |
| **Codex CLI** | Whatever Codex CLI is configured with locally; superpowers via the `npx -y skills add cloudflare/skills --skill '*' --yes --global` install per CF agent-setup docs |
| **OpenCode** | This repo's full stack: tiered models via CF AI Gateway, LSP integration (with `OPENCODE_EXPERIMENTAL_LSP_TOOL=true`), context7 + cloudflare-docs + snyk MCPs, obra/superpowers, per-agent LSP-and-superpowers prompt nudges |

**Fairness note**: we intentionally do NOT strip plugins for these runs. The benchmark question is "how does each tool perform in its *recommended* configuration" — not "how does each tool perform naked." Each tool's plugin stack and observed models are captured in the per-run notes so readers can see what they're comparing.

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
- `policy.json` — automated run contract: tools, requested models, expected outputs, and invalidation rules
- `results/runs/<RunId>/<tool>/` — outputs from each tool in each run
- `results/comparisons.md` — hand-maintained ranking log across runs

**Primary path: fully automated, non-interactive.**

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark-auto.ps1                                         # tic-tac-toe (default)
.\benchmark-auto.ps1 -Benchmark markdown-editor              # any other target
.\benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode  # one tool only
.\benchmark-auto.ps1 -Benchmark markdown-editor -Tools claude,codex,opencode
```

`benchmark-auto.ps1` launches each CLI non-interactively, captures raw stdout/stderr, snapshots `ccusage` before and after, copies deliverables into `results/runs/<RunId>/<tool>/output/`, writes `_run-result.json`, and runs the deterministic Playwright judge. A tool run is marked invalid if it violates `policy.json`: wrong model, missing expected outputs, auth/model rejection, or required OpenCode routing that did not happen.

There are two benchmark modes:

- `tool`: validates that the tool can complete the target with the requested model. `tic-tac-toe` uses this as a cheap harness smoke test.
- `architecture`: validates the tiered-routing thesis. `markdown-editor` requires OpenCode to show both `gpt-5` and the cheaper worker model in the run.

For architecture-mode runs, the benchmark is intentionally strict: producing a working app on `gpt-5` alone is not enough to prove the cost-tier thesis. The run must show model evidence that the orchestrator delegated to the cheaper worker tier. If a worker fails and the primary agent completes the task itself, the run can still be useful debugging evidence, but it is not counted as a valid routed architecture result.

The automated runner accepts either PowerShell array syntax (`-Tools claude,codex,opencode`) or repeated/string-list forms. It also injects an OpenCode-only architecture contract for architecture-mode targets: OpenCode must delegate implementation/test/docs work to a subagent and must not use Playwright/browser MCP during generation, because the harness runs deterministic Playwright judging after the CLI exits.

Qualitative judging remains available through `judge-run.ps1` and `judge-summarize.ps1`, but it is no longer part of the default automated path.

**Secondary path: guided manual workflow.**

```powershell
cd "<repo>\benchmarks\scripts"
.\benchmark.ps1                                              # guided manual mode
.\benchmark.ps1 -Benchmark markdown-editor
.\benchmark.ps1 -Benchmark tic-tac-toe,markdown-editor
```

`benchmark.ps1` still wraps the three lower-level scripts (`bench-run.ps1`, `judge-run.ps1`, `judge-summarize.ps1`) into a guided workflow:

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

The config lineage below is historical evidence, not the current recommendation. It includes stale assumptions such as OSS-as-coder and local-as-daily-driver that were later invalidated by benchmark runs. The current recommendation is summarized above and in [`docs/CURRENT-STRATEGY.md`](../docs/CURRENT-STRATEGY.md).

**Discovery (2026-05-26): for runs 1-4 the live opencode config was never re-copied from the repo template after iterations v3, v4, and v6.** The opencode actually running in those four runs was the original baseline prompt, not the iterated versions named in each run's config label. We discovered this on 2026-05-26 while investigating why the README rule "kept failing to land." Once the live config was synced (commit `6f910e7`), the very next run (`2026-05-26-0829`) produced the expected output: opencode wrote a 12,907-byte README and took composite #1. The four prior runs are now annotated `[CONFIG MISMATCH]` in `markdown-editor/results/comparisons.md`. Artifacts and per-tool numbers in those runs remain real; the experimental claim that "iteration didn't land" was an artifact of measuring the wrong configuration. The repo now ships a `Test-LiveConfigSync` preflight (in `bench-run.ps1`) that compares the live `agent.build.prompt` against `opencode.example.json` and warns loudly on drift before opening a run.

Config versions to date (each `comparisons.md` entry tags which version a run used):

- **Config v1 (baseline)**: LSP nudge + superpowers skill reference, no deliverable-discipline rules. Used for `tic-tac-toe` runs `2026-05-21-0818` and `2026-05-22-0745`, and `markdown-editor` run `2026-05-22-0837`. The markdown-editor run under v1 exposed: opencode placed tests in a `tests/` subdirectory (cost R9 and R10 even though the tests passed), wrote a one-line README, and the verification-before-completion skill didn't catch the test-location issue because it didn't actually run `node --test`.
- **Config v2 (deliverable-discipline)**: explicit prompt rules added -- "place files at root, do not nest in subdirectories" plus an abstract rule about README sections. Commit [`9b592ac`](../../../commit/9b592ac). Used for `markdown-editor` run `2026-05-22-0951`. Result: the file-layout rule landed cleanly (R9/R10 went FAIL -> PASS, opencode hit 10/10 functional), but the abstract README rule did NOT land -- opencode shipped a byte-identical one-line README to the previous run. The lesson, documented in [LEARNINGS.md](../docs/LEARNINGS.md): concrete mechanically-verifiable rules land, abstract content-quality rules don't.
- **Config v3 (template-driven README + Playwright MCP)**: replaced the abstract README rule with a concrete template (exact list of section headings, minimum line count, minimum sentence count per section) AND promoted Playwright MCP from "recommended optional" to a shipping default so the agent can self-verify HTML/JS deliverables in a real browser. Commits [`f6998a7`](../../../commit/f6998a7) and [`668038c`](../../../commit/668038c). Used for `markdown-editor` run `2026-05-24-0758`. **Result: the template-driven README rule did NOT land** -- opencode shipped another one-line README despite the now-mechanically-verifiable rule (named sections, min line count). Two abstract-to-concrete iterations have now failed. Documentation quality scored 1/5 again. The Playwright MCP self-verification half is harder to assess: opencode shipped a working app (10/10 R1-R10) and its inline JS rendered fine, so we can't tell if it actually invoked the MCP or just got lucky. Claude (which does not ship Playwright MCP) shipped a `</script>`-termination bug that broke runtime rendering -- a real browser smoke-test would have caught it. The lesson reinforces v2's: **even concrete prompt rules can fail to land if the agent does not surface the rule as a checked precondition.** The proposed run-4 change is to make the README rubric *scored* inside SPEC.md (each of 4 sections worth 1 quality point, all-or-nothing) so the agent's quality grade visibly depends on it, rather than relying on a prompt-side instruction the agent may or may not internalize. Also: tighten the verification step to *explicitly* require a Playwright MCP browser smoke-test (assert no console errors + preview non-empty after typing `# Hello`), and add a codex-CLI preflight to `bench-run.ps1` (run 3 lost the codex data point to silent token exhaustion).
- **Config v4 (scored README rubric + explicit Playwright smoke-test + CLI preflight)**: three changes informed by `markdown-editor` run `2026-05-24-0758`. (1) Documentation becomes a counted 0-5 rubric inside `SPEC.md` and `JUDGE-PROMPT.md` (one point per required README section) so the score is mechanical and the agent's quality grade visibly depends on README depth, rather than a prompt-side instruction the agent can ignore. (2) The opencode build-agent prompt now requires an explicit five-step Playwright MCP smoke-test for every HTML deliverable (navigate / snapshot / type / console-check / non-empty assertion), with no wiggle room and explicit instructions to HALT if the MCP is unavailable -- targets the class of bug claude shipped in run 3 (a `</script>` literal inside inline JS that killed runtime rendering, undetected by source-code review). (3) `bench-run.ps1` start phase now runs a CLI version-check preflight against each configured tool and prompts before proceeding if any tool is unreachable -- closes the silent codex token-exhaustion failure mode that wasted a run-3 data point. Hypothesis being tested for the next markdown-editor run: a scored rubric closes the documentation gap that two prompt-side iterations could not; the explicit smoke-test catches `</script>`-class bugs before claude can ship them; the preflight prevents the codex skip from recurring.
- **Config v5 (tool-selection workflow)**: explicit subset selection at start time, with a captured reason for every excluded tool. The user picks which tools to include via either an interactive prompt or `-IncludeTools claude,opencode`. The selection plus per-tool skip reasons are persisted in `_run-config.json` at the run root and copied into the results dir at finish time. Every downstream phase (preflight, auth-confirm, baseline capture, per-tool launch instructions, finish, judge-run cross-tool comparison, judge-summarize Final Summary) honors the selection. Skipped tools no longer appear as misleading 0/10-SKIP rows in the composite ranking -- instead they show up exactly once, in a "Skipped tools" section, with the user-supplied reason. Motivated by `markdown-editor` run `2026-05-24-0758`, where codex's mid-run API-token exhaustion produced an empty output dir that the judge dutifully recorded as SKIP, polluting the cross-tool comparison with a fake data point.
- **Config v6 (executable docs-check)**: across runs 1-3 the opencode agent emitted a one-line README despite three escalating prompt-side rules (v2 abstract, v3 concrete template, v4 scored rubric in JUDGE-PROMPT.md that the model never sees). The structural root cause: the build agent's completion gate is test-output-based (Playwright + node --test), and README depth has never been a gate -- it lives in the post-hoc quality dimensions. Same model (GPT-5) writes detailed READMEs under codex's harness and one-liners under opencode's; the variable is the harness's "am I done?" definition, not the model. Config v6 adds a Node one-liner to the build agent's verification step that runs AFTER the Playwright smoke-test and BEFORE completion is claimed. It counts H2 headings (`## `) and non-blank lines in README.md; exits non-zero if fewer than 5 headings or 40 lines. The model has to invoke it and observe its exit code. Vacuous structure (5 stub headings) can still pass this check, but the judge's content-based scored rubric (v4) catches that downstream. **This is the last prompt-side iteration**: if a fifth markdown-editor run STILL ships a 1-line README, the next move is to make README structure an R11 deterministic test in the Playwright suite (which would be the first benchmark change ever -- explicitly raising the bar, not lowering it).
- **Config v7 (live-config-sync preflight + methodology recovery)**: response to the 2026-05-26 discovery that runs 1-4 ran against a stale live config. Adds `Test-LiveConfigSync` to `bench-run.ps1`'s start phase: at preflight time it reads `~/.config/opencode/opencode.json` and `opencode.example.json`, compares the SHA256 hash of `agent.build.prompt` from each, and emits a yellow WARNING if they differ. The user can confirm-continue (use case: intentional local customization) or abort. Also retroactively annotates the four affected runs in `comparisons.md` and the top-level README. Hypothesis confirmed by run `2026-05-26-0829`: the v3/v4/v6 prompt-side rules DO land once they are actually present in the agent's runtime config. The four prior runs of "this rule doesn't land" were a measurement-design bug, not a falsification of the rule.
- **Config v8 (tier-routing for actual cost-tier test)**: the goal that motivated this repo from the beginning. The build agent now has explicit dispatch rules: grep/read/LSP lookups → `local` (granite4, free), structured code edits and test writing → `oss` (qwen32b via gateway, cents/M), design and unclear-debugging stays in `build` (gpt-5 via gateway). The three tier agents were promoted from `mode: primary` to `mode: "all"` so they remain user-selectable via `--agent <name>` AND become dispatchable via opencode's Task tool. **This is the first version where the "tiered savings" thesis can be measured within a single tool**: v1-v7 measured opencode-with-gpt-5 vs claude-code-with-opus, which mostly captured model-pricing differences, not architectural ones. Run 5 (`2026-05-26-0829`) is the unrouted baseline at $0.83. v8's controlled comparison: the next markdown-editor run with this config will dispatch routable subtasks to cheaper tiers. ccusage will show whether multiple models were used (proving routing fired) and what the total cost is. Success = multi-model ccusage breakdown + meaningful cost reduction from baseline. Failure (routing fires but cost doesn't drop) is also publishable: "dispatch overhead exceeds savings on tasks of this size." Either outcome answers the central question.
- **Config v9 (hard routing gate + leaf-agent lockdown)**: v8 proved prompt-side routing instructions do NOT fire on real workloads (run 6 / `2026-05-26-1132`: gpt-5 ran the entire benchmark on itself, zero dispatches). v9 converts the advisory routing into a hard tool-availability gate: `read`/`grep`/`glob`/`bash`/`webfetch`/`websearch` disabled on the build agent. The agent literally cannot do those itself; it MUST dispatch via Task tool. `oss` and `frontier` locked to leaf-only capabilities (`task`/`bash`/`webfetch`/`websearch`/`todowrite` disabled). **Result (2026-05-26): forced dispatch works architecturally -- but making the dispatched local subagent ACTUALLY USE its tools required separate work.** Across 7 attempted local-model configurations (granite4 silent, qwen2.5-coder-q4 malformed, gpt-oss wrong protocol via Ollama, qwen3-coder wrong format via Ollama, gpt-oss still wrong protocol via LM Studio, qwen3-coder context-overflow via LM Studio at default n_ctx 4096) we finally reached a working setup: **LM Studio + qwen3-coder-30b + n_ctx 16384 + `tools: true` at the model-definition level.** Smoke test passed: build dispatched to local, local invoked read tool, returned correct line count. Full debug story in [`docs/LEARNINGS.md` -> "Local LLM tool-calling with opencode is real, hard, and runtime-sensitive"](../docs/LEARNINGS.md). Performance honesty: even working, dispatched calls take 20-40s on consumer hardware -- impractical for daily use without 24GB+ VRAM. The realistic path forward for users without serious GPU is to route the `local` tier to a gateway-hosted cheap model (`gpt-4o-mini`, ~8x cheaper than gpt-5, fast inference, reliable tool calls). See SETUP.md for both paths.

A reader who's skeptical that we're tuning to make opencode look better can verify directly: the SPEC and PROMPT and Playwright assertions are byte-identical across all runs (check the git history). What changes between versions is only the agent's instructions about how to follow them. That's the legitimate direction of iteration -- improving an agent setup against a fixed bar -- not training to the test.

## Current benchmark targets

- [tic-tac-toe](tic-tac-toe/) -- standalone HTML tic-tac-toe, ~200-400 lines, exercises plan/execute/verify with bounded scope. **Status: automated smoke path is working. Policy mode is `tool`, so OpenCode does not need to route to a worker model for this tiny target.**
- [markdown-editor](markdown-editor/) -- standalone HTML markdown editor with live preview, ~300-500 lines, exercises parser design and XSS defensiveness. **Status: 6 runs complete. Runs 1-4 marked `[CONFIG MISMATCH]`. Policy mode is `architecture`, so OpenCode must show both frontier and cheaper worker models for a valid tier-routing result.**
- [react-todo-api-db](react-todo-api-db/) -- small full-stack React + API + SQLite app, dependency installs allowed, exercises project setup, persistence, validation, and frontend/API/database wiring. **Status: 1 valid run complete; all three tools pass with a real on-disk SQLite database. Policy mode is `architecture`, so OpenCode must show both frontier and cheaper worker models for a valid tier-routing result.**

  Latest run `2026-05-31-164112`:

  | Tool | Models observed | Cost | Functional result |
  |---|---|---:|---|
  | **OpenCode** | `gpt-5`, `gpt-5-mini` | **$0.193** | R1-R10 10/10 pass; SQLite file `data/todos.sqlite3` |
  | Codex | `gpt-5.4`, `gpt-5.5` | $2.032 | R1-R10 10/10 pass; SQLite file `data/todos.sqlite` |
  | Claude Code | `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5` | $1.580 | R1-R10 9/10 (R9 partial); SQLite file `data/todos.db` |

  Cross-run ranking log: [`react-todo-api-db/results/comparisons.md`](react-todo-api-db/results/comparisons.md).
- Current OpenCode architecture baseline: `gpt-5` orchestrator + `gpt-5-mini` coder. GLM remains assigned to cheaper search/read/planning workers, not implementation.

## Adding a new benchmark target

Targets are discovered by convention -- no central registry to update. A target is any directory under `benchmarks/` containing a `PROMPT.md`. To add one called `<target>` (use kebab-case):

```
benchmarks/<target>/
├── PROMPT.md            # required -- canonical prompt fed to every tool, verbatim
├── SPEC.md              # required -- R1-R10 acceptance criteria + quality dimensions
├── METHODOLOGY.md       # optional -- run-procedure notes; falls back to a default if absent
├── policy.json          # required for benchmark-auto.ps1
└── results/             # script-managed (auto-created on first run)
    ├── README.md        # optional, describes the layout to readers
    ├── comparisons.md   # optional, hand-maintained ranking log
    └── runs/            # populated by bench-run + judge-run + judge-summarize

benchmarks/scripts/judge/tests/<target>.spec.js   # required -- Playwright R1-R10 suite
```

The spec file name MUST match the target directory name exactly (kebab-case included). The judge subsystem uses `tests/<target>.spec.js` directly -- there is no map to edit.

**Why the Playwright spec lives outside the target dir**: it needs to `import` from `@playwright/test`, which only resolves under `benchmarks/scripts/judge/` where `npm install` ran. Keeping the spec in `tests/` avoids needing per-target node_modules.

**Easiest path** when adding a target: copy `benchmarks/tic-tac-toe/` to `benchmarks/<your-target>/`, copy `benchmarks/scripts/judge/tests/tic-tac-toe.spec.js` to `tests/<your-target>.spec.js`, then rewrite both for your target's app. Update `policy.json` to choose `tool` mode for smoke-style targets or `architecture` mode when OpenCode routing is part of the claim. Once those files exist, `benchmark-auto.ps1 -Benchmark <your-target>` works end-to-end.

## See also

- [`docs/PROBLEM.md`](../docs/PROBLEM.md) — the cost-tier thesis these benchmarks are evidence for
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — the OpenCode-side stack being measured
- [ccusage](https://github.com/ryoppippi/ccusage) — the token-tracking tool, supports Claude Code / Codex CLI / OpenCode
