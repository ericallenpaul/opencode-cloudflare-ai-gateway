# Hard Routing Gate + Leaf-Agent Lockdown (Config v9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force tier-routing by removing `read`/`grep`/`glob` tools from the build agent (Part A); tighten OSS/frontier subagents to leaf-only capabilities so the build agent is the single orchestrator (Part B); investigate per-agent MCP restrictions in opencode's schema (Part C). v8 proved prompt-side routing rules don't fire organically -- gpt-5 ran the entire 27-minute markdown-editor benchmark on itself without dispatching once. v9 converts the advisory rules into hard tool-availability gates: build literally cannot do a file read, so it MUST dispatch.

**This is the final architectural intervention before declaring a thesis verdict.** Two clean outcomes:

1. **v9 routes successfully AND costs drop.** Tiered architecture validated — forced dispatch saves money.
2. **v9 routes successfully but cost stays similar or rises.** Dispatch overhead exceeds savings on tasks of this size. Architecture works mechanically, but doesn't pay off below a complexity threshold worth measuring. Publishable conclusion.

Either outcome ends the chase and gives the repo a definitive answer.

**Architecture:** Six tasks. Tasks 1-3 are config changes + sync. Task 4 is a 60-second smoke test (build must now dispatch a file read because it has no read tool). Task 5 documents v9 in lineage. Task 6 commits plan + pushes. Task 7 is the user-executed benchmark.

**Tech Stack:** JSON (opencode.example.json + live config), Markdown (benchmarks/README), PowerShell (config sync only — no script changes needed).

---

## Files touched

- Modify: `opencode.example.json` (build/oss/frontier tool restrictions)
- Modify: live config at `~/.config/opencode/opencode.json` (mirror the changes; preserve user customizations)
- Modify: `benchmarks/README.md` (Config v9 lineage entry)
- No script changes — the benchmark harness already captures per-model tokens.

---

## Task 1: Investigate per-agent MCP restrictions

Determine whether opencode supports scoping MCP servers per agent (so local doesn't get playwright, etc.), or whether MCPs are global to all agents.

- [ ] **Step 1.1: Check the opencode SDK type definition for Agent**

```powershell
$sdkTypes = "$env:USERPROFILE\.config\opencode\node_modules\@opencode-ai\sdk\dist\v2\gen\types.gen.d.ts"
if (Test-Path $sdkTypes) {
    Select-String -Path $sdkTypes -Pattern "Agent|mcp" -Context 2 | Select-Object -First 30
}
```

Look for a field on the Agent type that scopes MCPs (e.g., `mcp?: {...}` per-agent, or `disabledMcp?: string[]`, etc.).

- [ ] **Step 1.2: Inspect installed agent configs for any MCP-per-agent example**

```powershell
$superpowersDir = "$env:USERPROFILE\.config\opencode\node_modules\superpowers"
Get-ChildItem $superpowersDir -Recurse -Include *.md, *.json -ErrorAction SilentlyContinue |
    Select-String -Pattern '"mcp"|mcp:|disableMcp' -List |
    Select-Object -First 5 -ExpandProperty Path
```

- [ ] **Step 1.3: Record the finding**

In your report, state: SUPPORTED (with the exact config syntax) or NOT SUPPORTED. If supported, plan a Part-C config change in Task 2. If not, defer MCP scoping to future opencode versions and just note in the lineage doc.

---

## Task 2: Apply v9 config changes to opencode.example.json

Three parts, all in the `agent.<name>.tools` blocks.

### Step 2.1: Lock down `build` (Part A — forces dispatch)

Find `opencode.example.json`'s `agent.build` block. It currently has:

```json
"build": {
    "tools": {
        "lsp": true
    },
    "prompt": "..."
}
```

Modify the tools block to also disable `read`, `grep`, `glob`:

```json
"build": {
    "tools": {
        "lsp": true,
        "read": false,
        "grep": false,
        "glob": false
    },
    "prompt": "..."
}
```

After v9, the build agent has access to: write, edit, bash, task (dispatch!), webfetch, websearch, todowrite, skill, lsp. **Not** read/grep/glob — for those it MUST dispatch to `local`.

### Step 2.2: Lock down `oss` and `frontier` (Part B — leaf-only capabilities)

Find `agent.oss.tools` and `agent.frontier.tools`. Each currently has `{"lsp": true}` and everything else defaults to enabled. Replace with the explicit leaf-capability set:

```json
"oss": {
    "mode": "all",
    "model": "workers-ai-via-gateway/@cf/qwen/qwen2.5-coder-32b-instruct",
    "tools": {
        "lsp": true,
        "task": false,
        "bash": false,
        "webfetch": false,
        "websearch": false,
        "todowrite": false
    }
}

"frontier": {
    "mode": "all",
    "model": "openai-via-gateway/gpt-5",
    "tools": {
        "lsp": true,
        "task": false,
        "bash": false,
        "webfetch": false,
        "websearch": false,
        "todowrite": false
    }
}
```

These keep: `read`, `grep`, `glob`, `write`, `edit`, `skill` (all defaults). They lose: `task` (no recursive dispatch), `bash` (no shell from leaf), `webfetch`/`websearch` (no external HTTP), `todowrite` (plans live in orchestrator).

Note: `skill` stays enabled for oss/frontier because skill invocations (e.g., TDD) can be useful inside subtask execution. Local keeps `skill: false` because lookup work doesn't need it.

### Step 2.3: (Part C — only if Task 1 said SUPPORTED) Restrict MCP access

If Task 1 found per-agent MCP scoping support, add an `mcp` block to each subagent restricting them. Suggested:
- `local`: no MCPs (just LSP and reads)
- `oss`: maybe `context7` for docs lookups during code generation; no `playwright`/`snyk`
- `frontier`: keep all MCPs (frontier is for hard reasoning; it might need any of them)
- `build`: keep all MCPs (orchestrator needs everything)

Skip if Task 1 said NOT SUPPORTED.

### Step 2.4: Validate JSON parses

```powershell
Get-Content opencode.example.json -Raw | ConvertFrom-Json | Out-Null
```
Expected: no error.

### Step 2.5: Spot-check the resulting tool config

```powershell
$cfg = Get-Content opencode.example.json -Raw | ConvertFrom-Json
foreach ($name in @('build','local','oss','frontier')) {
    $a = $cfg.agent.$name
    "  $name :"
    "    mode: $($a.mode)"
    "    model: $($a.model)"
    $tools = if ($a.tools) {
        ($a.tools.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', '
    } else { '(none)' }
    "    tools: $tools"
}
```

Expected output (paraphrasing):
- build : tools: lsp=True, read=False, grep=False, glob=False
- local : tools: write=False, edit=False, bash=False, task=False, webfetch=False, websearch=False, todowrite=False, lsp=True, skill=False
- oss : tools: lsp=True, task=False, bash=False, webfetch=False, websearch=False, todowrite=False
- frontier : tools: lsp=True, task=False, bash=False, webfetch=False, websearch=False, todowrite=False

### Step 2.6: Run check-setup.ps1

```powershell
.\scripts\check-setup.ps1
```
Expected: same PASS/FAIL set as before. No new failures.

### Step 2.7: Commit

```powershell
git add opencode.example.json
git commit -m "opencode: hard-gate tier routing (v9) -- build loses read/grep/glob; oss/frontier locked to leaf capabilities"
```

---

## Task 3: Sync live config (assistant executes; surgical preserve)

The live config at `~/.config/opencode/opencode.json` has customizations to preserve (permission block, extra cloudflare MCPs). Don't blindly overwrite.

- [ ] **Step 3.1: Back up the live config**

```powershell
$liveConfig = "$env:USERPROFILE\.config\opencode\opencode.json"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backup = "$liveConfig.bak.v9.$stamp"
Copy-Item $liveConfig $backup -Force
```

- [ ] **Step 3.2: Surgical sync of just the tool blocks**

```powershell
$live = Get-Content $liveConfig -Raw | ConvertFrom-Json
$ex = Get-Content opencode.example.json -Raw | ConvertFrom-Json

# Mirror the tool blocks ONLY -- preserve everything else in live.
$live.agent.build.tools = $ex.agent.build.tools
$live.agent.local.tools = $ex.agent.local.tools  # already aligned probably
$live.agent.oss.tools = $ex.agent.oss.tools
$live.agent.frontier.tools = $ex.agent.frontier.tools

# Also sync the build prompt (still has the v8 tier-routing instructions — keep it in case
# the prompt + hard gate together produce better dispatch quality than the gate alone).
$live.agent.build.prompt = $ex.agent.build.prompt

$live | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 $liveConfig
```

- [ ] **Step 3.3: Verify customizations preserved**

```powershell
$check = Get-Content $liveConfig -Raw | ConvertFrom-Json
"  permission block: $($check.PSObject.Properties.Name -contains 'permission')"
"  cloudflare MCP: $($check.mcp.PSObject.Properties.Name -contains 'cloudflare')"
"  cloudflare-bindings: $($check.mcp.PSObject.Properties.Name -contains 'cloudflare-bindings')"
"  cloudflare-builds: $($check.mcp.PSObject.Properties.Name -contains 'cloudflare-builds')"
"  cloudflare-observability: $($check.mcp.PSObject.Properties.Name -contains 'cloudflare-observability')"
"  default model gpt-5: $($check.model -eq 'openai-via-gateway/gpt-5')"
"  build.tools: $(($check.agent.build.tools.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', ')"
"  oss.tools: $(($check.agent.oss.tools.PSObject.Properties | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', ')"
```

All preserved-checks should be True. build.tools should show read=False/grep=False/glob=False. oss.tools should show task=False/bash=False/etc.

- [ ] **Step 3.4: Test-LiveConfigSync should NOT trigger**

The v7 preflight only compares `agent.build.prompt`. Tool changes don't trip it. That's a known gap but fine for now — explicit verification via Step 3.3 covers it.

---

## Task 4: Forced-dispatch smoke test (USER-executed)

After Task 3, the build agent literally has no read tool. Any prompt that requires reading a file MUST dispatch.

- [ ] **Step 4.1 (USER): Launch opencode and run a read-required test**

```
Read the file benchmarks/markdown-editor/PROMPT.md and tell me how many lines it has.
```

Expected behavior under v9:
- Build agent sees no read tool available
- Decides "I must dispatch this read to local"
- Calls `Task(agent: "local", description: "read PROMPT.md and count lines", prompt: "...")`
- Local subagent (granite4) reads the file
- Returns line count to build
- Build relays answer

Trace should show: "Local · granite4:7b-a1b-h" (the dispatched call) followed by "Build · gpt-5" (the relay).

- [ ] **Step 4.2 (USER): If dispatch fails**

If the build agent refuses to dispatch (e.g., "I don't have a read tool and won't dispatch"), that's a major issue. Most likely:
- The routing instructions in the build prompt aren't strong enough
- Or opencode handles missing tools differently than expected

Report back and we'll diagnose.

If dispatch fires AND returns the line count: routing forced successfully → proceed to benchmark.

---

## Task 5: Document Config v9 in benchmarks/README.md

- [ ] **Step 5.1: Add the Config v9 bullet**

After the existing Config v8 bullet, add:

```markdown
- **Config v9 (hard routing gate + leaf-agent lockdown)**: v8 proved prompt-side routing instructions do NOT fire on real workloads (run 6 / `2026-05-26-1132` showed gpt-5 ran the entire 27-minute markdown-editor benchmark on itself, zero dispatches, despite the build prompt's explicit routing rules). Same pattern as the README rule pre-config-sync: prompt-side guidance does not reliably override the model's organic preference. v9 converts the advisory routing into a hard tool-availability gate: `read`, `grep`, `glob` are disabled on the build agent. The agent literally cannot do those itself; it MUST dispatch to `local` to access them. Additionally, `oss` and `frontier` are locked down to leaf-only capabilities -- `task` disabled (no recursive dispatch; build is the single orchestrator), `bash`/`webfetch`/`websearch` disabled (no shell or HTTP from leaves), `todowrite` disabled (plans live in the orchestrator). This is the final architectural intervention before declaring a thesis verdict. Two clean outcomes: (1) routing fires AND cost drops vs run 6 baseline ($0.65) -- tiered architecture validated; (2) routing fires but cost stays similar or rises -- dispatch overhead exceeds savings, also a publishable conclusion. Either way, the thesis is resolved.
```

- [ ] **Step 5.2: Update markdown-editor status**

```markdown
- [markdown-editor](markdown-editor/) -- standalone HTML markdown editor with live preview, ~300-500 lines, exercises parser design and XSS defensiveness. **Status: 6 runs complete. Runs 1-4 marked `[CONFIG MISMATCH]`. Run 5 (`2026-05-26-0829`) is the v6 baseline ($0.83, single-model). Run 6 (`2026-05-26-1132`) tested v8 prompt-side routing -- routing did NOT fire on real workload despite explicit instructions ($0.65, gpt-5 only). Config v9 (hard tool-availability gate) is queued for run 7: the definitive thesis test.**
```

- [ ] **Step 5.3: Commit**

```powershell
git add benchmarks/README.md
git commit -m "benchmarks README: document Config v9 (hard routing gate -- definitive thesis test)"
```

---

## Task 6: Commit plan + push

- [ ] **Step 6.1: Stage and commit the plan**

```powershell
git add .claude/memory-bank/main/plans/2026-05-26-hard-routing-gate-v9.md
git commit -m "Add v9 hard-routing-gate plan to memory-bank"
```

- [ ] **Step 6.2: Push everything**

```powershell
git push origin main
```

---

## Task 7 (USER-EXECUTED): Run the controlled v9 benchmark

The actual thesis test. Comparable to run 6 (v8 prompt-side, no dispatch) and run 5 (v6 baseline, no routing instructions).

- [ ] **Step 7.1 (USER): Confirm Task 4 smoke-test passed**

If forced dispatch didn't fire, fix that first. Don't burn benchmark tokens on a broken setup.

- [ ] **Step 7.2 (USER): Run the benchmark**

```powershell
.\benchmarks\scripts\benchmark.ps1 -Benchmark markdown-editor -IncludeTools opencode
```

- [ ] **Step 7.3 (USER + ASSISTANT): Examine ccusage**

```powershell
$rid = (Get-ChildItem benchmarks\runs -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
Get-Content "benchmarks\runs\$rid\opencode\_delta-summary.txt"
```

**Critical observations:**
- `Models used` line: should show `gpt-5` AND `granite4` (proves forced dispatch fired). If still gpt-5 only, something deeper is wrong with opencode's tool-gating.
- Total cost: compare to run 6 ($0.65). Lower = thesis validated. Similar/higher = overhead exceeds savings.
- Wall clock: compare to run 6 (27m 53s). Dispatch adds latency; if much slower, that's another data point.

- [ ] **Step 7.4 (ASSISTANT): Publish the result**

Add a run-7 bullet to comparisons.md with framing based on actual data. Update top-level README. Declare the thesis verdict.

---

## Self-review

1. **Spec coverage:** Part A (build lockdown), Part B (oss/frontier leaf-mode), Part C (MCP investigation) all covered.
2. **Placeholders:** none.
3. **Backward compat:** the v9 changes don't affect runs 1-6 artifacts. The live config has been synced before in v6/v8 — same surgical preserve pattern.
4. **What v9 does NOT do:**
   - Doesn't touch SPEC/PROMPT/Playwright assertions (byte-identical to all prior runs).
   - Doesn't add new scripts or change the benchmark harness.
   - Doesn't try to fix prompt-side routing (we've confirmed that path doesn't work; abandoning it).

---

## Execution

Subagent-driven:
- Task 1: `sonnet` (investigation; needs judgment to confirm syntax)
- Task 2: `sonnet` (JSON edits with careful field placement)
- Task 3: `sonnet` (surgical sync; preserves user customizations)
- Task 4: report-only; user runs the smoke test
- Task 5: `haiku` (text edits)
- Task 6: `haiku` (commit + push)
- Task 7: user-executed; assistant analyzes
