# Tier-Routing Validation (Config v8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Actually test the tiered-routing thesis. Wire opencode's build-agent prompt with explicit dispatch rules ("grep/read to `local`, structured edits to `oss`, hard reasoning stays in `build`/frontier") so the build agent uses opencode's Task tool to spawn subagents on cheaper tiers. Then a controlled A/B comparison against run 5 (which used the SAME prompt+config minus the routing rules) measures the actual cost delta from tier routing -- not from model swap, not from harness leanness, not from gateway. This is the real test of the repo's central thesis.

**Architecture:** Six tasks. Tasks 1-4 are automation (verify Task-tool syntax, design routing prompt, add to opencode.example.json, smoke-test dispatch works). Tasks 5-6 are docs + plan publication. Task 7 is the user-executed benchmark run. The A/B comparison baseline is run `2026-05-26-0829` (run 5): same config minus the routing rules. The thesis is provable from a single new routed run.

**Tech Stack:** JSON (opencode build-agent prompt), Markdown (benchmarks/README), PowerShell (no script changes needed -- benchmark infra is already in place from v1-v7).

**The success criterion is quantitative.** A successful v8 outcome is: (a) the routed run shows multiple models in ccusage output (proving routing fired, not just was instructed), AND (b) total cost is meaningfully lower than run 5's $0.83 -- target ~30%+ reduction would validate the thesis. If routing fires but cost doesn't drop, that's ALSO publishable: "tier-routing has overhead that exceeds savings on tasks of this size." Either result answers the question.

---

## Files touched

- Modify: `opencode.example.json` (add the tier-routing block to `agent.build.prompt`)
- Modify: `benchmarks/README.md` (Config v8 lineage entry)
- No script changes — the benchmark harness from v1-v7 captures per-model tokens already.

---

## Task 1: Verify opencode Task-tool subagent dispatch syntax

The plan's correctness depends on knowing the right syntax for spawning a named subagent. Different opencode versions use different parameter names (`agent`, `subagent_type`, or `agentType`). This task confirms the exact form before we bake it into the prompt.

- [ ] **Step 1.1: Check opencode CLI help for Task tool**

```powershell
opencode --help | Select-String -Pattern "task|agent|sub" -CaseSensitive:$false
```
Note any references to Task tool documentation paths.

- [ ] **Step 1.2: Inspect the installed superpowers skill that already uses Task dispatch**

The `superpowers:subagent-driven-development` skill dispatches via the Task tool. Find its skill definition file in `~/.config/opencode/node_modules/superpowers/skills/subagent-driven-development/`. Search inside for the literal Task-tool invocation example:

```powershell
$superpowersDir = "$env:USERPROFILE\.config\opencode\node_modules\superpowers\skills"
if (Test-Path $superpowersDir) {
    Get-ChildItem $superpowersDir -Recurse -Include *.md | Select-String -Pattern "Task\s*\(" -List | Select-Object -First 5 -ExpandProperty Path
}
```
Open any matching skill file and inspect a few examples of Task() invocations. Note the EXACT parameter name used for the subagent (looking for `agent: "..."`, `subagent_type: "..."`, etc.).

- [ ] **Step 1.3: Test a one-line dispatch manually (optional but valuable)**

If the syntax is still ambiguous, the user can run a minimal opencode session with a prompt like "Use the Task tool to dispatch a subagent named 'local' that just outputs the word 'hello'." If it works, we have the syntax. If opencode errors, the error message will name the correct parameter.

This step may be skipped if 1.1 + 1.2 gave a confident answer.

- [ ] **Step 1.4: Record the canonical syntax**

Write down the verified Task-tool subagent-dispatch signature (e.g., `Task(subagent_type: "local", description: "...", prompt: "...")`) in your report. This goes verbatim into Task 2's prompt text.

---

## Task 2: Design the tier-routing prompt section

The routing rules must be (a) concrete -- name specific subtask types, name specific subagents -- (b) example-driven, (c) honest about ambiguity ("default to build when unsure"). Goal length: 250-350 words. Anything longer bloats the prompt.

- [ ] **Step 2.1: Draft the routing block**

Write the section as plain text first (before JSON-escaping). Required structure:

```
## Tier-routing for cost optimization

You have access to opencode's Task tool, which spawns subagents on different cost tiers. The repo defines three subagents:

- `local` — `ollama/granite4:7b-a1b-h` (free, on-device). Best for: deterministic lookups (grep, glob, file reads of <500 lines), LSP symbol queries, simple text transforms.
- `oss` — `workers-ai-via-gateway/@cf/qwen/qwen2.5-coder-32b-instruct` (cents/M tokens). Best for: structured code edits with a clear spec, single-function implementations, test writing for a given signature, documentation generation from a spec.
- `frontier` — `openai-via-gateway/gpt-5` (you — the build agent yourself). Reserved for: design decisions, multi-file reasoning, debugging unclear failures, anything where model capability materially affects outcome.

When you have a subtask that fits the `local` or `oss` profile, dispatch it via the Task tool: <CANONICAL SYNTAX FROM TASK 1.4 GOES HERE>.

Examples of correct dispatch:
- "Find every file that imports `markdown.js`" → dispatch to `local`.
- "Read `markdown.html` and extract the inline parser function" → dispatch to `local`.
- "Write a unit test that asserts `parse('# h1')` returns `<h1>h1</h1>`" → dispatch to `oss`.
- "Generate a 5-section README from this spec" → dispatch to `oss`.
- "Decide whether to use Marked.js vs a hand-rolled parser" → keep in build (you).
- "The Playwright test is failing intermittently, figure out why" → keep in build (you).

Default to keeping work in `build` when unsure. Mis-dispatching to a weaker tier wastes a roundtrip when the subagent can't complete the task. The cost saving from a successful local-tier dispatch only pays off if the dispatch SUCCEEDS on the first attempt.

When you dispatch, pass the subagent enough context to complete the subtask without coming back for clarification. Specifically: include the file path(s) it needs to read, the exact spec it needs to meet, and the output format you expect back.
```

Note: replace `<CANONICAL SYNTAX FROM TASK 1.4 GOES HERE>` with the actual signature recorded in Task 1.4.

- [ ] **Step 2.2: Sanity-check the draft against the v6 build prompt**

Open the current `agent.build.prompt` in `opencode.example.json` and read the existing structure. Confirm the new section will fit naturally near the top, after any "core identity" framing but before the deliverable-discipline rules. Note the line/position where you'll insert it.

---

## Task 3: Add the routing block to opencode.example.json

**Files:**
- Modify: `opencode.example.json` (the `agent.build.prompt` string)

- [ ] **Step 3.1: Insert the new routing section at the start of the build prompt**

The new section should be the FIRST major block in the build agent's prompt. Place it before any existing "deliverable discipline" or "verification" content, so the agent sees the routing rules when deciding how to approach a new task -- not after it has already decided to do everything itself.

JSON-escape the routing block (literal newlines → `\n`, `"` → `\"`, no raw tabs). Replace the front portion of `agent.build.prompt` so the routing rules come first, followed by the existing content unchanged.

- [ ] **Step 3.2: Validate the JSON parses**

```powershell
Get-Content opencode.example.json -Raw | ConvertFrom-Json | Out-Null
```
Expected: no output, no error.

- [ ] **Step 3.3: Sanity-check the build prompt length**

The v6 build prompt was ~5,334 chars. The routing block adds ~1,200 chars (rough estimate). New length should be ~6,500 chars. If significantly larger, look for accidental duplication or over-bloated text.

```powershell
$cfg = Get-Content opencode.example.json -Raw | ConvertFrom-Json
$cfg.agent.build.prompt.Length
```

- [ ] **Step 3.4: Run check-setup.ps1**

```powershell
.\scripts\check-setup.ps1
```
Expected: same PASS/FAIL set as before. No new failures.

- [ ] **Step 3.5: Commit**

```powershell
git add opencode.example.json
git commit -m "opencode build agent: add tier-routing dispatch rules (local/oss/frontier) for cost-tier benchmark"
```

---

## Task 4: Dispatch smoke-test (optional but valuable)

Before running the full benchmark, verify that the build agent actually CAN dispatch to a local subagent and get a result. If context-passing is broken between agents, the benchmark will fail in an unproductive way -- catch this in 5 minutes instead.

- [ ] **Step 4.1: Sync the live config**

Tell the user to copy `opencode.example.json` over their live config (preserving local customizations like the `permission` block and extra MCPs):

```powershell
# User executes this -- not the implementer
$liveConfig = "$env:USERPROFILE\.config\opencode\opencode.json"
$live = Get-Content $liveConfig -Raw | ConvertFrom-Json
$ex = Get-Content opencode.example.json -Raw | ConvertFrom-Json
Copy-Item $liveConfig "$liveConfig.bak.v8" -Force
$live.agent.build.prompt = $ex.agent.build.prompt
$live | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 $liveConfig
```

This is a USER step, not an implementer step. Document it in the report and stop.

- [ ] **Step 4.2: Smoke test (user-executed)**

User runs a one-off opencode session: launch opencode in any directory, paste prompt:

```
Use opencode's Task tool to dispatch a subagent named `local` and have it run the command `echo hello from local tier`. Report back the output you got.
```

Observe what happens. If the build agent dispatches and the local subagent (granite4) returns "hello from local tier", routing capability is confirmed. If it errors with "unknown parameter" or similar, the Task syntax in the prompt is wrong and we revise.

User reports back: did the dispatch fire? Did the response come from granite4 (visible as a model change in opencode's UI or via `ccusage opencode session`)? If yes → proceed to Task 7 (full benchmark). If no → debug Task syntax.

---

## Task 5: Document Config v8 in benchmarks/README.md

**Files:**
- Modify: `benchmarks/README.md`

- [ ] **Step 5.1: Add the Config v8 bullet**

After the existing Config v7 bullet in the "How we've iterated the opencode config" section, add:

```
- **Config v8 (tier-routing for actual cost-tier test)**: the goal that motivated this repo from the beginning. The build agent now has explicit dispatch rules: grep/read/LSP lookups → `local` (granite4, free), structured code edits and test writing → `oss` (qwen32b via gateway, cents/M), design and unclear-debugging stays in `build` (gpt-5 via gateway). The opencode Task tool spawns the appropriate subagent based on subtask type. **This is the first version where the "tiered savings" thesis can be measured within a single tool**: v1-v7 measured opencode-with-gpt-5 vs claude-code-with-opus, which mostly captured model-pricing differences, not architectural ones. Run 5 (`2026-05-26-0829`) is the unrouted baseline at $0.83. v8's controlled comparison: the next markdown-editor run with this config will dispatch routable subtasks to cheaper tiers. ccusage will show whether multiple models were used (proving routing fired) and what the total cost is. Success = multi-model ccusage breakdown + meaningful cost reduction from baseline. Failure (routing fires but cost doesn't drop) is also publishable: "dispatch overhead exceeds savings on tasks of this size." Either outcome answers the central question.
```

- [ ] **Step 5.2: Update "Current benchmark targets" status line**

Find the markdown-editor status line. Replace it with:

```
- [markdown-editor](markdown-editor/) -- standalone HTML markdown editor with live preview, ~300-500 lines, exercises parser design and XSS defensiveness. **Status: 5 runs complete; runs 1-4 marked `[CONFIG MISMATCH]`. Run 5 (`2026-05-26-0829`) is the v6 baseline (unrouted, $0.83). Config v8 (tier-routing) is queued for run 6: the first valid test of the tiered-savings thesis. Success criterion: multi-model ccusage breakdown + cost reduction vs run 5.**
```

- [ ] **Step 5.3: Commit**

```powershell
git add benchmarks/README.md
git commit -m "benchmarks README: document Config v8 (tier-routing for the actual cost-tier thesis test)"
```

---

## Task 6: Commit the v8 plan to memory-bank

- [ ] **Step 6.1: Stage and commit**

```powershell
git add .claude/memory-bank/main/plans/2026-05-26-tier-routing-v8.md
git commit -m "Add v8 tier-routing plan to memory-bank"
```

- [ ] **Step 6.2: Push everything**

```powershell
git push origin main
```

---

## Task 7 (USER-EXECUTED): Run the controlled comparison benchmark

This task is NOT executable by an automation subagent -- it requires the user to launch opencode interactively and paste the PROMPT.md.

- [ ] **Step 7.1 (USER): Confirm Task 4 smoke-test passed**

If routing didn't work in Task 4, stop here. Don't burn benchmark tokens on a broken setup.

- [ ] **Step 7.2 (USER): Run the benchmark**

```powershell
.\benchmarks\scripts\benchmark.ps1 -Benchmark markdown-editor -IncludeTools opencode
```

Use `-IncludeTools opencode` to avoid wasting time/tokens on claude and codex -- those don't exercise tier routing and they cost much more per run. The thesis test is opencode-only.

- [ ] **Step 7.3 (USER): After completion, examine ccusage output**

```powershell
Get-Content benchmarks\markdown-editor\results\runs\<NEW_RUN_ID>\opencode\_delta-summary.txt
```

Look at the "Models used" line. **The critical observation:**
- If it lists ONLY `gpt-5` -- routing did NOT fire even though we instructed it. Prompt-side routing failed; document and stop here.
- If it lists `gpt-5` AND `granite4` AND/OR `qwen` -- routing fired. Compare cost to run 5's $0.83. Cost lower → thesis validated. Cost similar → routing fires but doesn't save (overhead = savings). Cost higher → routing introduces overhead AND something's wrong.

- [ ] **Step 7.4 (USER + ASSISTANT): Document the result**

Add a new bullet to `comparisons.md` for the new run with the explicit cost-routing comparison vs run 5. Update the top-level README with the thesis-test result. The framing depends on what the data shows -- we'll write it together after the run.

---

## Self-review

1. **Spec coverage:** Tasks 1-2 design the routing instructions. Task 3 ships them. Task 4 smoke-tests the dispatch mechanism. Task 5 documents the change. Task 6 publishes the plan + pushes. Task 7 runs the actual benchmark.
2. **Placeholders:** Task 2.1 has `<CANONICAL SYNTAX FROM TASK 1.4 GOES HERE>` which is resolved by Task 1's output. All other code blocks contain literal final text.
3. **The actual experiment is sound:** the only difference between run 5 and the new run is the routing block in the build prompt. Everything else (Playwright smoke-test, docs-check, model defaults, MCPs, providers) is identical. The cost-delta isolates routing's contribution.
4. **Failure modes:**
   - Routing doesn't fire (model stays gpt-5 only): prompt-side routing rules don't land. We've seen this pattern before with the README rule. Lesson learned about prompt vs gate enforcement.
   - Routing fires but cost goes UP: dispatch overhead exceeds savings. Publishable finding.
   - Routing fires AND cost drops: thesis validated. Publishable finding.
   - Routing fires but functional quality drops (R1-R10 fails): tier routing trades cost for capability. Publishable nuance.
5. **What this plan does NOT do:**
   - Auto-sync the live config (Task 4.1 is documented as a user step because we don't want to silently mutate user files).
   - Build a `-Routing on|off` flag in bench-run.ps1. Simpler to compare against the existing run 5 baseline.
   - Touch SPEC/PROMPT/R1-R10 -- byte-identical to all prior runs.

---

## Execution

Subagent-driven:
- Task 1: `sonnet` (investigation + reading skill files; needs judgment to pick the right syntax)
- Task 2: `sonnet` (prompt design; quality of the routing text matters)
- Task 3: `sonnet` (JSON edit; careful escaping required)
- Task 4: report-only; the actual smoke-test is user-executed
- Task 5: `haiku` (text-only doc edit)
- Task 6: `haiku` (commit + push)
- Task 7: user-executed; assistant analyzes the result after
