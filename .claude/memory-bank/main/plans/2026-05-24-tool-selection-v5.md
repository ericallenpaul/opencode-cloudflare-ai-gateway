# Tool-Selection Workflow (Config v5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tool selection from "always run all configured tools" to "user explicitly picks the subset and gives a reason for any exclusion." Persist the selection at `_run-config.json` in the run dir; thread it through every downstream phase so skipped tools never show up as misleading 0/10-SKIP rows in the composite or the cross-tool comparison. Skipped tools get an honest "Skipped: <reason>" row instead.

**Architecture:** Selection happens once, at the top of `bench-run.ps1 -Phase start`. The selection is persisted as `_run-config.json` at the RunId-scratch root (`benchmarks/runs/<RunId>/_run-config.json`) and also copied into the results dir (`benchmarks/<benchmark>/results/runs/<RunId>/_run-config.json`) by the finish phase so it lives alongside the durable artifacts. Every downstream consumer (bench-run finish, benchmark.ps1 orchestrator, judge-run.ps1, judge-summarize.ps1) reads this file and iterates ONLY over the `selected` list. Skipped tools are represented exactly once — in `_run-config.json` — and rendered everywhere a tool would otherwise appear (cross-tool comparison, final summary, per-tool README links).

**Tech Stack:** PowerShell 5+/7+ (the existing script set), JSON for the selection file, Markdown for the user-facing output files.

**Backward compat:** Pre-v5 runs do NOT have `_run-config.json`. Every reader treats "file missing" as "all configured tools selected, no skips" so resume-from-mid-v4-run keeps working.

---

## Files touched

- Modify: `benchmarks/scripts/bench-run.ps1` (start phase: add selection, write `_run-config.json`; finish phase: copy `_run-config.json` to results dir, gracefully no-op on skipped tools)
- Modify: `benchmarks/scripts/benchmark.ps1` (accept `-IncludeTools`, read `_run-config.json`, only finish/judge selected tools, rephrase the ENTER message)
- Modify: `benchmarks/scripts/judge-run.ps1` (read `_run-config.json`, include skipped tools in the cross-tool comparison with their user-supplied reason instead of as missing dirs)
- Modify: `benchmarks/scripts/judge-summarize.ps1` (composite ranking over selected only; add Skipped Tools section to the Final Summary)
- Modify: `benchmarks/README.md` (Config v5 lineage bullet)

No file creation. No tests added (no test harness exists for these scripts; validation is by smoke-test + the next benchmark run).

---

## `_run-config.json` schema

A single file persisted at the RunId scratch root by the start phase and copied to the results root by the finish phase. Schema:

```json
{
  "runId": "2026-05-24-1430",
  "benchmark": "markdown-editor",
  "selected": ["claude", "opencode"],
  "skipped": {
    "codex": "out of API tokens"
  },
  "selectedAt": "2026-05-24T14:30:00-04:00"
}
```

- `selected`: ordered array of tool names that will run. Must be a subset of the script's configured `$Tools` list. Order matches the original `$Tools` order so per-tool launch instructions print in a stable sequence.
- `skipped`: map of `<toolName>: <reason>` for every configured tool NOT in `selected`. The reason is a free-text one-liner provided by the human at selection time. May be empty `{}` if every configured tool was selected.
- `selected.Count == 0` is a fatal error at write time: the start phase refuses to proceed if zero tools are selected.

---

## Task 1: Add tool selection + `_run-config.json` to bench-run.ps1 start phase

**Files:**
- Modify: `benchmarks/scripts/bench-run.ps1` (param block; start-phase preflight block; baseline loop)

- [ ] **Step 1.1: Add the `-IncludeTools` param**

In the `param( ... )` block at the top of `bench-run.ps1` (around lines 61-83), after the existing `[string]$Benchmark = "tic-tac-toe"` line, add:

```powershell
    # Optional comma-separated list of tool names to include. If omitted in the
    # start phase, prompts interactively. Validated against the $Tools config.
    # Example: -IncludeTools claude,opencode
    [string[]]$IncludeTools,
```

- [ ] **Step 1.2: Add a `Select-Tools` helper**

Insert this helper after the existing `Test-ToolReachable` function (added in v4). The helper takes the configured `$Tools` list and either applies `-IncludeTools` or asks the human interactively, returning `(selected, skippedMap)`:

```powershell
function Select-Tools {
    param(
        [Parameter(Mandatory)][object[]]$ConfiguredTools,
        [string[]]$IncludeTools
    )

    # Map tool name -> bool (selected or not). Maintain $ConfiguredTools order.
    $orderedNames = @($ConfiguredTools | ForEach-Object { $_.Name })
    $isSelected = [ordered]@{}
    foreach ($n in $orderedNames) { $isSelected[$n] = $false }

    if ($IncludeTools -and $IncludeTools.Count -gt 0) {
        $unknown = @($IncludeTools | Where-Object { $orderedNames -notcontains $_ })
        if ($unknown.Count -gt 0) {
            throw "Unknown tool name(s) in -IncludeTools: $($unknown -join ', '). Configured tools: $($orderedNames -join ', ')"
        }
        foreach ($n in $IncludeTools) { $isSelected[$n] = $true }
    } else {
        Write-Host ""
        Write-Host "Select which tools to include in this benchmark run." -ForegroundColor Cyan
        Write-Host "(For any tool you exclude, you'll be asked to record a one-line reason.)" -ForegroundColor DarkGray
        foreach ($n in $orderedNames) {
            $ans = Read-Host "  Include $n? [Y/n]"
            $isSelected[$n] = ($ans -notmatch '^[nN]')
        }
    }

    $selected = @($orderedNames | Where-Object { $isSelected[$_] })
    if ($selected.Count -eq 0) {
        throw "At least one tool must be selected. Aborting."
    }

    $skipped = [ordered]@{}
    $unselected = @($orderedNames | Where-Object { -not $isSelected[$_] })
    if ($unselected.Count -gt 0 -and (-not $IncludeTools)) {
        Write-Host ""
        Write-Host "Record a one-line reason for each excluded tool (visible in the run summary):" -ForegroundColor Cyan
        foreach ($n in $unselected) {
            $reason = Read-Host "  Reason for skipping $n"
            if ([string]::IsNullOrWhiteSpace($reason)) { $reason = "no reason given" }
            $skipped[$n] = $reason.Trim()
        }
    } elseif ($unselected.Count -gt 0) {
        # Non-interactive path: use a placeholder reason
        foreach ($n in $unselected) {
            $skipped[$n] = "excluded via -IncludeTools (non-interactive)"
        }
    }

    return @{ Selected = $selected; Skipped = $skipped }
}
```

- [ ] **Step 1.3: Call the helper at the top of the start phase**

In the `if ($Phase -eq "start") { ... }` block, BEFORE the existing preflight (around line 199), insert:

```powershell
    $selection = Select-Tools -ConfiguredTools $Tools -IncludeTools $IncludeTools
    Write-Host ""
    Write-Host "Selected: $($selection.Selected -join ', ')" -ForegroundColor Green
    if ($selection.Skipped.Count -gt 0) {
        Write-Host "Skipped:"
        foreach ($k in $selection.Skipped.Keys) {
            Write-Host "  $k -- $($selection.Skipped[$k])" -ForegroundColor DarkGray
        }
    }
    Write-Host ""

    # Build the runtime tool list (only selected). Preserve the launch metadata
    # from the original $Tools so the per-tool printing below stays unchanged.
    $runtimeTools = @($Tools | Where-Object { $selection.Selected -contains $_.Name })
```

Then REPLACE every subsequent reference to `$Tools` inside the start-phase if-block (the preflight loop, the auth-confirm message, the baseline-capture loop, the launch-instructions loop) with `$runtimeTools`. Be precise — search for `foreach ($t in $Tools)` inside the start phase only. The finish phase still uses the global `$Tools` config for its own purposes.

The auth-confirm "before continuing, confirm each tool can produce a token" reminder block should also enumerate only the selected tools (replace the hardcoded 3-bullet list with a dynamic foreach over `$runtimeTools`):

```powershell
    Write-Host "Auth/quota check (manual): the preflight above only confirms each CLI is on PATH." -ForegroundColor DarkGray
    Write-Host "  It does NOT verify subscription state or API token balance." -ForegroundColor DarkGray
    Write-Host "  Before continuing, confirm each selected tool can actually produce a token:" -ForegroundColor DarkGray
    foreach ($t in $runtimeTools) {
        Write-Host "    - $($t.Name)" -ForegroundColor DarkGray
    }
    $authResp = Read-Host "Are all selected tools authenticated and within quota? [y/N]"
    if ($authResp -notmatch '^[Yy]') {
        Write-Host "Aborting start phase. Resolve auth/quota issues and re-run." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
```

- [ ] **Step 1.4: Write `_run-config.json` to the scratch RunId root**

The scratch RunId root is `Join-Path $BaseDir $RunId` (NOT per-tool — the file lives one level above the per-tool dirs). After the selection is finalized and before the baseline loop, write the JSON:

```powershell
    $runIdDir = Join-Path $BaseDir $RunId
    New-Item -ItemType Directory -Force -Path $runIdDir | Out-Null
    $runConfig = [ordered]@{
        runId       = $RunId
        benchmark   = $Benchmark
        selected    = $selection.Selected
        skipped     = $selection.Skipped
        selectedAt  = (Get-NowIso)
    }
    $runConfigPath = Join-Path $runIdDir "_run-config.json"
    $runConfig | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $runConfigPath
    Write-Host "Wrote run config: $runConfigPath" -ForegroundColor DarkGray
```

- [ ] **Step 1.5: Smoke-test interactive path**

```powershell
.\benchmarks\scripts\bench-run.ps1 -Phase start -Benchmark markdown-editor -RunId v5-smoketest-interactive
```

Answer the prompts: `Y, n, Y` (claude yes, codex no, opencode yes), then "out of API tokens" as the codex reason. Expected: preflight + auth-confirm only mention claude and opencode; baseline-capture only happens for claude and opencode; per-tool launch instructions print for claude and opencode only. Inspect:

```powershell
Get-Content benchmarks\runs\v5-smoketest-interactive\_run-config.json
```

Expected JSON: selected=["claude","opencode"], skipped={"codex":"out of API tokens"}.

Cleanup:
```powershell
Remove-Item -Recurse -Force benchmarks\runs\v5-smoketest-interactive
```

- [ ] **Step 1.6: Smoke-test `-IncludeTools` path**

```powershell
.\benchmarks\scripts\bench-run.ps1 -Phase start -Benchmark markdown-editor -RunId v5-smoketest-cli -IncludeTools claude,opencode
```

Expected: NO interactive selection prompts; selection summary prints "Selected: claude, opencode" and "Skipped: codex -- excluded via -IncludeTools (non-interactive)"; preflight runs and the script proceeds.

Cleanup:
```powershell
Remove-Item -Recurse -Force benchmarks\runs\v5-smoketest-cli
```

- [ ] **Step 1.7: Smoke-test the "all selected" path (no skips)**

```powershell
.\benchmarks\scripts\bench-run.ps1 -Phase start -Benchmark markdown-editor -RunId v5-smoketest-all -IncludeTools claude,codex,opencode
```

Expected: skipped is `{}`, no "Skipped:" line prints, baseline runs for all three.

Cleanup:
```powershell
Remove-Item -Recurse -Force benchmarks\runs\v5-smoketest-all
```

- [ ] **Step 1.8: Smoke-test the validation error path**

```powershell
.\benchmarks\scripts\bench-run.ps1 -Phase start -Benchmark markdown-editor -RunId v5-smoketest-bad -IncludeTools clade,opencode
```

Expected: throws with message "Unknown tool name(s) in -IncludeTools: clade." Script exits non-zero. No `_run-config.json` written.

- [ ] **Step 1.9: Commit**

```powershell
git add benchmarks/scripts/bench-run.ps1
git commit -m "bench-run start: add interactive tool selection + -IncludeTools + _run-config.json"
```

---

## Task 2: bench-run.ps1 finish phase honors `_run-config.json`

The finish phase is called per-tool by the orchestrator. We add two pieces of behavior: (a) copy `_run-config.json` from the scratch RunId dir to the results RunId dir so it lives with the durable artifacts; (b) refuse to finish a tool that was skipped during start (defense-in-depth — the orchestrator shouldn't call us for skipped tools, but if someone runs `bench-run.ps1 -Phase finish` manually, we want to fail loudly).

**Files:**
- Modify: `benchmarks/scripts/bench-run.ps1` (finish phase block)

- [ ] **Step 2.1: Add the skip check + copy at the top of the finish phase**

In the `if ($Phase -eq "finish") { ... }` block, near the top (after the existing `Tool` and `RunDir` resolution), insert:

```powershell
    # v5: honor _run-config.json — refuse to finish a skipped tool, and copy the
    # config into the results dir so downstream phases find it.
    $runIdDir       = Split-Path -Parent $RunDir
    $runConfigPath  = Join-Path $runIdDir "_run-config.json"
    if (Test-Path $runConfigPath) {
        $runConfig = Get-Content $runConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
        $skippedNames = @()
        if ($runConfig.skipped) {
            $skippedNames = @($runConfig.skipped.PSObject.Properties.Name)
        }
        if ($skippedNames -contains $Tool) {
            throw "Tool '$Tool' was marked SKIPPED in _run-config.json (reason: $($runConfig.skipped.$Tool)). Finish refuses to proceed."
        }
        # Copy run config into results dir for durable storage
        $resultsRunIdDir = Join-Path $repoRoot "benchmarks\$Benchmark\results\runs\$RunId"
        New-Item -ItemType Directory -Force -Path $resultsRunIdDir | Out-Null
        $resultsConfigPath = Join-Path $resultsRunIdDir "_run-config.json"
        Copy-Item -Force $runConfigPath $resultsConfigPath
    }
    # If no _run-config.json exists, this is a pre-v5 run — fall through to legacy behavior (all tools assumed selected).
```

- [ ] **Step 2.2: Smoke-test manual finish refusal**

Re-run the interactive smoke-test from Task 1.5 (`v5-smoketest-interactive`), let the start phase write `_run-config.json` with codex skipped, then:

```powershell
.\benchmarks\scripts\bench-run.ps1 -Phase finish -Benchmark markdown-editor -RunId v5-smoketest-interactive -Tool codex -RunDir benchmarks\runs\v5-smoketest-interactive\codex
```

Expected: throws with message containing "marked SKIPPED in _run-config.json (reason: out of API tokens)". Exit non-zero. Confirms the defense-in-depth check works.

Cleanup:
```powershell
Remove-Item -Recurse -Force benchmarks\runs\v5-smoketest-interactive
```

- [ ] **Step 2.3: Commit**

```powershell
git add benchmarks/scripts/bench-run.ps1
git commit -m "bench-run finish: refuse to finish skipped tools; copy _run-config.json to results dir"
```

---

## Task 3: benchmark.ps1 orchestrator threads selection through every phase

The orchestrator is the entry point. It needs to: (a) accept `-IncludeTools` and forward it to `bench-run.ps1 -Phase start`; (b) read `_run-config.json` after start completes; (c) iterate over selected tools only when invoking the finish phase; (d) rephrase the wait-for-ENTER message to enumerate exactly which tools the human needs to run; (e) handle resume — if `_run-config.json` exists, use it; if not, fall back to all-configured-tools.

**Files:**
- Modify: `benchmarks/scripts/benchmark.ps1`

- [ ] **Step 3.1: Add `-IncludeTools` to the orchestrator's param block**

In the `param( ... )` block (lines 27-30), after `[string[]]$Benchmark = @("tic-tac-toe")`, add:

```powershell
    [string[]]$IncludeTools
```

- [ ] **Step 3.2: Forward `-IncludeTools` to bench-run start**

Find the line that invokes start (around line 263):

```powershell
    & $benchRun -Phase start -Benchmark $currentBenchmark -RunId $runId
```

Replace with:

```powershell
    if ($IncludeTools) {
        & $benchRun -Phase start -Benchmark $currentBenchmark -RunId $runId -IncludeTools $IncludeTools
    } else {
        & $benchRun -Phase start -Benchmark $currentBenchmark -RunId $runId
    }
```

- [ ] **Step 3.3: Add a helper to load the run config**

Near the existing `Get-RunState` function (around line 55), add:

```powershell
function Get-RunConfig {
    param(
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$RepoRoot
    )
    # Prefer the scratch copy (written first by start); fall back to the
    # results copy (written by finish); fall back to a synthesized "all tools
    # selected" config for pre-v5 runs.
    $scratchPath = Join-Path $RepoRoot "benchmarks\runs\$RunId\_run-config.json"
    $resultsPath = $null
    # We do not know the benchmark name here, so the scratch path is the
    # canonical source. The orchestrator passes it along.
    if (Test-Path $scratchPath) {
        return Get-Content $scratchPath -Raw -Encoding utf8 | ConvertFrom-Json
    }
    return $null
}
```

- [ ] **Step 3.4: Rephrase the wait-for-ENTER message**

Find (around line 272):

```powershell
    Wait-ForEnter "Run each tool per the instructions above. Exit each one cleanly. When all are done, press ENTER."
```

Replace with:

```powershell
    $runConfig = Get-RunConfig -RunId $runId -RepoRoot $repoRoot
    if ($runConfig -and $runConfig.selected) {
        $toolList = ($runConfig.selected -join ', ')
        Wait-ForEnter "Run these tools per the instructions above: $toolList. Exit each one cleanly. When ALL of them are done, press ENTER."
    } else {
        Wait-ForEnter "Run each tool per the instructions above. Exit each one cleanly. When all are done, press ENTER."
    }
```

- [ ] **Step 3.5: Make the finish phase iterate selected tools only**

Find the finish invocation (around line 284):

```powershell
    & $benchRun -Phase finish -RunId $runId -Benchmark $currentBenchmark
```

Inspect that block — `bench-run.ps1 -Phase finish` is invoked here. Today's `bench-run.ps1` finish phase already loops internally over its `$Tools` config, finishing each one. We need bench-run finish itself to honor `_run-config.json` and skip tools listed under `skipped`. That logic lives in `bench-run.ps1` (added defensively in Task 2 for the manual-invocation case). For the loop-driven case, we add the same filtering inside `bench-run.ps1`'s finish loop.

Open `bench-run.ps1` and find the finish-phase `foreach ($t in $Tools)` loop (search for the line that does the per-tool finalization in finish phase — it's the main body of the finish block). At the top of each loop iteration, insert:

```powershell
        if ($skippedNames -contains $t.Name) {
            Write-Host "Skipping $($t.Name) (marked skipped in _run-config.json: $($runConfig.skipped.($t.Name)))" -ForegroundColor DarkGray
            continue
        }
```

(The `$skippedNames` and `$runConfig` variables are already in scope from the Task 2 changes if you hoisted them out of the per-tool conditional — if not, hoist them now so they're available at finish-phase startup.)

- [ ] **Step 3.6: Smoke-test full happy path with selection**

```powershell
.\benchmarks\scripts\benchmark.ps1 -Benchmark markdown-editor -IncludeTools claude,opencode
```

Expected: the orchestrator's start phase calls bench-run with `-IncludeTools claude,opencode`. The selection summary prints. The wait-for-ENTER message says "Run these tools per the instructions above: claude, opencode." Press Ctrl+C immediately to abort the smoke-test (we're verifying the message, not running a full benchmark).

- [ ] **Step 3.7: Smoke-test the resume path**

Manually create a `_run-config.json` for a synthetic RunId:

```powershell
$rid = "v5-smoketest-resume"
New-Item -ItemType Directory -Force -Path "benchmarks\runs\$rid" | Out-Null
@{
    runId = $rid
    benchmark = "markdown-editor"
    selected = @("claude","opencode")
    skipped = @{ codex = "test-resume" }
    selectedAt = "2026-05-24T14:00:00-04:00"
} | ConvertTo-Json | Set-Content "benchmarks\runs\$rid\_run-config.json"
```

Then invoke `benchmark.ps1` and answer "Y" to the resume prompt for `v5-smoketest-resume`. Expected: the wait-for-ENTER message names exactly `claude, opencode`.

Cleanup:
```powershell
Remove-Item -Recurse -Force benchmarks\runs\v5-smoketest-resume
```

- [ ] **Step 3.8: Commit**

```powershell
git add benchmarks/scripts/benchmark.ps1 benchmarks/scripts/bench-run.ps1
git commit -m "benchmark orchestrator: forward -IncludeTools; ENTER message enumerates selected tools"
```

(Two files commit together because Task 3.5's finish-phase filter is in `bench-run.ps1` but it's enabling Task 3's orchestrator behavior. They make no sense apart.)

---

## Task 4: judge-run.ps1 honors `_run-config.json` and renders skipped tools

`judge-run.ps1` currently discovers tools by listing subdirs of the results dir that have an `output/` child. Skipped tools never created an `output/` dir, so they're invisible to discovery. We want them visible in the cross-tool comparison with their user-supplied reason.

**Files:**
- Modify: `benchmarks/scripts/judge-run.ps1`

- [ ] **Step 4.1: Load `_run-config.json` near the top of the script**

After the existing path/preflight section (around line 90, after the `Test-Path $resultsDir` check), insert:

```powershell
$runConfigPath = Join-Path $resultsDir "_run-config.json"
$skippedTools  = [ordered]@{}
if (Test-Path $runConfigPath) {
    try {
        $runConfig = Get-Content $runConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($runConfig.skipped) {
            foreach ($p in $runConfig.skipped.PSObject.Properties) {
                $skippedTools[$p.Name] = [string]$p.Value
            }
        }
    } catch {
        Write-Host "WARNING: failed to parse $runConfigPath -- treating as pre-v5 run." -ForegroundColor Yellow
    }
}
```

- [ ] **Step 4.2: Include skipped tools in the cross-tool comparison output**

Find the section that builds the cross-tool comparison markdown (`<RunId>-judge.md`). It builds a `$toolResults` array and renders a table. AFTER the existing `$toolResults += ...` accumulation loop completes, add skipped tools as additional rows:

```powershell
foreach ($skipName in $skippedTools.Keys) {
    $toolResults += [PSCustomObject]@{
        Tool         = $skipName
        Skipped      = $true
        SkipReason   = $skippedTools[$skipName]
        HtmlPath     = $null
        TestFile     = $null
        PlaywrightOk = $false
        R9Status     = 'N/A'
        R10Status    = 'N/A'
        JudgeJsonPath = $null
        JudgeMdPath   = $null
    }
}
```

Then find every renderer that iterates `$toolResults` to print rows. They already check `$tr.Skipped`. Update the cell printout to use `$tr.SkipReason` when present:

In the per-criterion row builder (around the existing `if ($tr.Skipped) { 'SKIP' }` line), keep `SKIP` as the cell text but add a footnote-style line after the table that lists `<tool>: skipped — <reason>`. Just below the existing PASS-count row and before the next section, insert:

```powershell
$skipFootnote = @($toolResults | Where-Object { $_.Skipped -and $_.SkipReason })
if ($skipFootnote.Count -gt 0) {
    $mdLines += ""
    $mdLines += "### Skipped tools"
    $mdLines += ""
    foreach ($s in $skipFootnote) {
        $mdLines += "- **$($s.Tool)** -- $($s.SkipReason)"
    }
    $mdLines += ""
}
```

- [ ] **Step 4.3: Skip per-tool processing for skipped tools (no judge.md stub, no _judge-functional.json)**

Find the per-tool processing loop (`foreach ($toolDir in $toolDirs)`). It already handles "no HTML file" gracefully. We don't need extra work here — judge-run.ps1 only iterates discovered output dirs, and skipped tools have none. The new rows we added in Step 4.2 only appear in the cross-tool comparison, which is the right behavior.

- [ ] **Step 4.4: Update the per-tool prompt generator to skip skipped tools**

Find the section that writes `judge-prompt-<tool>.md` (the pre-substituted JUDGE-PROMPT.md copies for each tool, generated near the end of judge-run.ps1). That loop already iterates `$toolResults | Where-Object { -not $_.Skipped }`. Confirm this is still correct — skipped tools get NO judge-prompt file because there's no output to judge. (No edit required if the existing filter already excludes skipped. Confirm visually.)

- [ ] **Step 4.5: Smoke-test**

Use the v5-smoketest-interactive run from Task 1.5 (recreate if cleaned up). Then invoke `judge-run.ps1 -RunId v5-smoketest-interactive -Benchmark markdown-editor` (after copying _run-config.json into the results dir manually — the Task 2 finish step normally does this, but for an isolated smoke we'll do it by hand):

```powershell
$rid = "v5-smoketest-judge"
$resultsDir = "benchmarks\markdown-editor\results\runs\$rid"
New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
# Create _run-config.json showing codex skipped
@{
    runId = $rid
    benchmark = "markdown-editor"
    selected = @("claude","opencode")
    skipped = @{ codex = "smoketest-skipped" }
    selectedAt = "2026-05-24T14:00:00-04:00"
} | ConvertTo-Json | Set-Content "$resultsDir\_run-config.json"
# Create empty selected tool dirs so judge-run has something to iterate
New-Item -ItemType Directory -Force -Path "$resultsDir\claude\output" | Out-Null
New-Item -ItemType Directory -Force -Path "$resultsDir\opencode\output" | Out-Null
# (No real HTML files -- judge-run will skip the per-tool work, but the cross-tool comparison should still render skipped section.)
.\benchmarks\scripts\judge-run.ps1 -RunId $rid -Benchmark markdown-editor
```

Then read `benchmarks\markdown-editor\results\runs\$rid\$rid-judge.md` and confirm a `### Skipped tools` section exists with `- **codex** -- smoketest-skipped`.

Cleanup:
```powershell
Remove-Item -Recurse -Force "benchmarks\markdown-editor\results\runs\v5-smoketest-judge"
```

- [ ] **Step 4.6: Commit**

```powershell
git add benchmarks/scripts/judge-run.ps1
git commit -m "judge-run: include skipped tools in cross-tool comparison with user-supplied reason"
```

---

## Task 5: judge-summarize.ps1 — composite over selected only, Skipped section in Final Summary

The final summary computes a composite ranking. Today it iterates over every per-tool `judge.md` it finds, so skipped tools (no judge.md) are naturally excluded. We need to explicitly add a "Skipped Tools" subsection to the Final Summary so a reader doesn't think the row is missing.

**Files:**
- Modify: `benchmarks/scripts/judge-summarize.ps1`

- [ ] **Step 5.1: Load `_run-config.json` near the top**

After the existing path resolution (look for where `$resultsDir` gets set), add:

```powershell
$skippedTools = [ordered]@{}
$runConfigPath = Join-Path $resultsDir "_run-config.json"
if (Test-Path $runConfigPath) {
    try {
        $rc = Get-Content $runConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($rc.skipped) {
            foreach ($p in $rc.skipped.PSObject.Properties) {
                $skippedTools[$p.Name] = [string]$p.Value
            }
        }
    } catch {
        # Pre-v5 run -- no skips to record
    }
}
```

- [ ] **Step 5.2: Render the Skipped Tools section in the Final Summary**

Find where judge-summarize writes the Final Summary block (it appends to `<RunId>.md` between `<!-- JUDGE-SUMMARY-START -->` and `<!-- JUDGE-SUMMARY-END -->` markers). After the existing composite ranking table and before the closing `JUDGE-SUMMARY-END` marker, add:

```powershell
if ($skippedTools.Count -gt 0) {
    $summary += ""
    $summary += "### Skipped tools"
    $summary += ""
    $summary += "The following tools were excluded at run start and are NOT part of the composite ranking above:"
    $summary += ""
    foreach ($n in $skippedTools.Keys) {
        $summary += "- **$n** -- $($skippedTools[$n])"
    }
    $summary += ""
}
```

(Adjust `$summary` to whatever variable name the script actually uses for the summary lines array — read the file and confirm.)

- [ ] **Step 5.3: Confirm composite excludes skipped tools**

Read the loop that computes the composite ranking. It already iterates over `judge.md` files it finds on disk. Skipped tools have no `judge.md`. No change needed; just confirm by reading the loop.

- [ ] **Step 5.4: Smoke-test**

This is harder to smoke-test in isolation because judge-summarize needs a full set of filled-in `judge.md` files. Instead, do a code review: verify that the new Skipped Tools section appears between JUDGE-SUMMARY markers, and that the composite-ranking table is unaffected. Defer real validation to the next full benchmark run.

- [ ] **Step 5.5: Commit**

```powershell
git add benchmarks/scripts/judge-summarize.ps1
git commit -m "judge-summarize: render Skipped Tools section in Final Summary (composite excludes skipped)"
```

---

## Task 6: Document Config v5 in benchmarks/README.md

**Files:**
- Modify: `benchmarks/README.md` ("How we've iterated the opencode config" section)

- [ ] **Step 6.1: Add the Config v5 bullet**

Find the existing Config v4 bullet (it starts with `- **Config v4 (scored README rubric + explicit Playwright smoke-test + CLI preflight)**`). After it, add:

```
- **Config v5 (tool-selection workflow)**: explicit subset selection at start time, with a captured reason for every excluded tool. The user picks which tools to include via either an interactive prompt or `-IncludeTools claude,opencode`. The selection plus per-tool skip reasons are persisted in `_run-config.json` at the run root and copied into the results dir at finish time. Every downstream phase (preflight, auth-confirm, baseline capture, per-tool launch instructions, finish, judge-run cross-tool comparison, judge-summarize Final Summary) honors the selection. Skipped tools no longer appear as misleading 0/10-SKIP rows in the composite ranking -- instead they show up exactly once, in a "Skipped Tools" section, with the user-supplied reason. Motivated by `markdown-editor` run `2026-05-24-0758`, where codex's mid-run API-token exhaustion produced an empty output dir that the judge dutifully recorded as SKIP, polluting the cross-tool comparison with a fake data point.
```

- [ ] **Step 6.2: Commit**

```powershell
git add benchmarks/README.md
git commit -m "benchmarks README: document Config v5 (explicit tool-selection workflow)"
```

---

## Self-review

1. **Spec coverage:** Every change the user requested is covered: tool selection at start (Task 1); reason capture for skipped tools (Task 1); persistence (`_run-config.json` written in Task 1, copied in Task 2); orchestrator honors selection (Task 3); judge phases honor selection (Tasks 4-5); lineage doc updated (Task 6).
2. **Placeholder scan:** No TBD / TODO / "fill in details" placeholders. Every code block contains the literal code to write.
3. **Naming consistency:** `_run-config.json` everywhere, never `_tools.json` or `_selection.json`. `selected` (array) and `skipped` (object/hash) keys everywhere. `IncludeTools` (plural, with capital T) as the CLI param name everywhere.
4. **Backward compat:** Every reader (Task 2.1, Task 3.3, Task 4.1, Task 5.1) handles missing-file as "pre-v5 run, default to all configured tools selected." Resume from a v4-mid-run keeps working.
5. **Failure modes:**
   - Zero tools selected: Task 1.2's `Select-Tools` throws.
   - Unknown tool in `-IncludeTools`: Task 1.2's `Select-Tools` throws with the configured-tools list in the error message.
   - Manual `bench-run.ps1 -Phase finish -Tool codex` for a skipped tool: Task 2.1 throws with the reason in the error message.
   - Malformed `_run-config.json`: Tasks 4.1 and 5.1 catch the parse error and treat as pre-v5. Tasks 2 and 3 (which throw on parse errors) are acceptable because they run during an interactive session where the user is present to debug.
6. **Independence:** Tasks 1, 2, and 3 are tightly coupled (3 builds on 2 builds on 1). Tasks 4, 5, 6 are independent of each other and can be done in any order after 3. The plan commits in 1-2-3-4-5-6 order, but the reviewer can revisit if a step fails partially.

---

## Execution

Subagent-driven, same model selection as the v4 plan:
- Tasks 1, 2: `sonnet` (PowerShell + JSON serialization)
- Task 3: `sonnet` (orchestrator coordination)
- Task 4: `sonnet` (judge-run.ps1 has more code to navigate)
- Task 5: `sonnet`
- Task 6: `sonnet` or `haiku` (text-only)

Reviewers: `haiku` for each (mechanical diff check).
