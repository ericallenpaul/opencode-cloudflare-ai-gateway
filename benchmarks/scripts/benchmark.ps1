<#
.SYNOPSIS
  One-command orchestrator for the full benchmark pipeline.

.DESCRIPTION
  Wraps bench-run.ps1 + judge-run.ps1 + judge-summarize.ps1 into a single
  guided workflow with two manual checkpoints (run-the-tools, fill-in-
  qualitative-scores). Auto-detects in-progress runs and resumes from
  whichever phase is next.

  Underlying scripts stay unchanged. Each is idempotent on its own, so
  this orchestrator can pick up cleanly after a Ctrl+C or terminal
  close, by re-invoking and answering "resume".

.PARAMETER Benchmark
  Benchmark folder name(s) under benchmarks/. Default: tic-tac-toe.
  Accepts a comma-separated list to run multiple targets in sequence:
  the orchestrator runs each one end-to-end (start, tools, finish,
  judge-run, qualitative-pass, summarize) before moving on to the next.

.EXAMPLE
  .\benchmark.ps1
  .\benchmark.ps1 -Benchmark markdown-editor
  .\benchmark.ps1 -Benchmark tic-tac-toe,markdown-editor
#>

[CmdletBinding()]
param(
    [string[]]$Benchmark = @("tic-tac-toe")
)

$ErrorActionPreference = "Stop"

# ============================================================
# Config
# ============================================================

$DIMS = @("Readability", "Test breadth", "UX polish", "Defensiveness", "Documentation")

$repoRoot       = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$benchRun       = Join-Path $PSScriptRoot "bench-run.ps1"
$judgeRun       = Join-Path $PSScriptRoot "judge-run.ps1"
$judgeSummarize = Join-Path $PSScriptRoot "judge-summarize.ps1"

foreach ($s in @($benchRun, $judgeRun, $judgeSummarize)) {
    if (-not (Test-Path $s)) {
        throw "Missing required script: $s"
    }
}

# ============================================================
# State detection
# ============================================================

function Get-RunState {
    param(
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$Benchmark,
        [Parameter(Mandatory)][string]$RepoRoot
    )

    $scratchDir = Join-Path $RepoRoot "benchmarks\runs\$RunId"
    $resultsDir = Join-Path $RepoRoot "benchmarks\$Benchmark\results\runs\$RunId"
    $runIdMd    = Join-Path $resultsDir "$RunId.md"

    if (-not (Test-Path $scratchDir) -and -not (Test-Path $resultsDir)) {
        return "missing"
    }

    # bench-run finish hasn't completed if <RunId>.md is absent
    if (-not (Test-Path $runIdMd)) {
        return "after-start"
    }

    # judge-run hasn't completed if no _judge-functional.json exists
    $hasFunc = $null
    if (Test-Path $resultsDir) {
        $hasFunc = Get-ChildItem -Path $resultsDir -Recurse -Filter "_judge-functional.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if (-not $hasFunc) {
        return "after-finish"
    }

    # qualitative pass not complete if any tool's judge.md is missing any dimension score
    $allFilled = $true
    $toolDirs = Get-ChildItem -Path $resultsDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "judge.md") }
    if ($toolDirs.Count -eq 0) { $allFilled = $false }
    foreach ($td in $toolDirs) {
        $content = Get-Content -Raw -Path (Join-Path $td.FullName "judge.md")
        foreach ($d in $DIMS) {
            $escaped = [Regex]::Escape($d)
            # Support either bullet (`- Readability: 4`) or table (`| Readability | 4 | ... |`)
            $bulletRe = '(?im)^[\t ]*-[\t ]*' + $escaped + '\s*:\s*([1-5])\b'
            $tableRe  = '(?im)^\|\s*' + $escaped + '\s*\|\s*([1-5])\s*\|'
            if ($content -notmatch $bulletRe -and $content -notmatch $tableRe) {
                $allFilled = $false
                break
            }
        }
        if (-not $allFilled) { break }
    }
    if (-not $allFilled) {
        return "after-judge"
    }

    # Final summary marker present?
    $finalContent = Get-Content -Raw -Path $runIdMd
    if ($finalContent -match "<!-- JUDGE-SUMMARY-START") {
        return "complete"
    }
    return "after-qualitative"
}

function Wait-ForEnter {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ""
    Write-Host $Message -ForegroundColor Yellow
    [void](Read-Host "Press ENTER to continue")
}

# Safety check: this orchestrator has manual checkpoints (Read-Host pauses).
# If stdin is redirected (piped, CI, etc.), Read-Host returns immediately and
# the script silently skips through the human steps, producing bogus artifacts.
# Refuse to run unprotected in that mode -- caller should invoke the
# underlying scripts directly if they need non-interactive automation.
if ([Console]::IsInputRedirected) {
    Write-Host ""
    Write-Host "ERROR: benchmark.ps1 must run in an interactive terminal." -ForegroundColor Red
    Write-Host "  Stdin appears redirected (pipe / CI / non-tty). The manual checkpoints" -ForegroundColor Yellow
    Write-Host "  (run-the-tools, qualitative-pass) would be skipped, producing empty" -ForegroundColor Yellow
    Write-Host "  outputs. For non-interactive use, call bench-run.ps1, judge-run.ps1," -ForegroundColor Yellow
    Write-Host "  and judge-summarize.ps1 directly." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ============================================================
# Validate every requested benchmark target exists
# ============================================================

foreach ($b in $Benchmark) {
    $targetDir = Join-Path $repoRoot "benchmarks\$b"
    if (-not (Test-Path $targetDir)) {
        throw "Unknown benchmark target: $b  (no directory at $targetDir)"
    }
}

# ============================================================
# Loop over each requested benchmark target
# ============================================================

$totalBenchmarks = $Benchmark.Count
$benchmarkIndex = 0
foreach ($currentBenchmark in $Benchmark) {
    $benchmarkIndex++

    if ($totalBenchmarks -gt 1) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Magenta
        Write-Host ("Benchmark {0} of {1}: {2}" -f $benchmarkIndex, $totalBenchmarks, $currentBenchmark) -ForegroundColor Magenta
        Write-Host "============================================================" -ForegroundColor Magenta
    }

# ============================================================
# Discover any in-progress runs
# ============================================================

$resultsRunsDir = Join-Path $repoRoot "benchmarks\$currentBenchmark\results\runs"
$scratchRunsDir = Join-Path $repoRoot "benchmarks\runs"

$allRunIds = @()
if (Test-Path $resultsRunsDir) {
    $allRunIds += (Get-ChildItem $resultsRunsDir -Directory -ErrorAction SilentlyContinue).Name
}
if (Test-Path $scratchRunsDir) {
    $allRunIds += (Get-ChildItem $scratchRunsDir -Directory -ErrorAction SilentlyContinue).Name
}
$allRunIds = @($allRunIds | Sort-Object -Unique)

$inProgress = @()
foreach ($id in $allRunIds) {
    $st = Get-RunState -RunId $id -Benchmark $currentBenchmark -RepoRoot $repoRoot
    if ($st -ne "complete" -and $st -ne "missing") {
        $inProgress += [PSCustomObject]@{ RunId = $id; State = $st }
    }
}

# ============================================================
# Banner + choose action
# ============================================================

Write-Host ""
Write-Host "Benchmark orchestrator" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host "  Target: $currentBenchmark"
Write-Host ""

$runId = $null
$state = "fresh"

if ($inProgress.Count -eq 0) {
    $state = "fresh"
}
elseif ($inProgress.Count -eq 1) {
    $p = $inProgress[0]
    Write-Host "Found in-progress run: $($p.RunId)  (state: $($p.State))" -ForegroundColor Cyan
    $choice = Read-Host "Resume this run? [Y/n] (n = start a new run)"
    if ($choice -match '^[nN]') {
        $state = "fresh"
    } else {
        $runId = $p.RunId
        $state = $p.State
        Write-Host "Resuming $runId from state '$state'" -ForegroundColor DarkGray
    }
}
else {
    Write-Host "Multiple in-progress runs:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $inProgress.Count; $i++) {
        $p = $inProgress[$i]
        Write-Host ("  [{0}] {1}  (state: {2})" -f ($i + 1), $p.RunId, $p.State)
    }
    Write-Host "  [n] Start a new run"
    $choice = Read-Host "Choose [1-$($inProgress.Count) or n]"
    if ($choice -match '^[nN]') {
        $state = "fresh"
    } else {
        $idx = [int]$choice - 1
        if ($idx -lt 0 -or $idx -ge $inProgress.Count) {
            throw "Invalid choice: $choice"
        }
        $runId = $inProgress[$idx].RunId
        $state = $inProgress[$idx].State
        Write-Host "Resuming $runId from state '$state'" -ForegroundColor DarkGray
    }
}

# ============================================================
# Phase 1 -- start (only if fresh)
# ============================================================

if ($state -eq "fresh") {
    $runId = Get-Date -Format "yyyy-MM-dd-HHmm"
    Write-Host ""
    Write-Host "Phase 1/3: Capturing ccusage baselines (all configured tools)..." -ForegroundColor Green
    Write-Host "  RunId: $runId"
    Write-Host ""
    & $benchRun -Phase start -Benchmark $currentBenchmark -RunId $runId
    $state = "after-start"
}

# ============================================================
# Manual checkpoint A -- user runs each tool
# ============================================================

if ($state -eq "after-start") {
    Wait-ForEnter "Run each tool per the instructions above. Exit each one cleanly. When all are done, press ENTER."
    $state = "ready-for-finish"
}

# ============================================================
# Phase 2 -- finish (token deltas) + judge-run (R1-R10)
# ============================================================

if ($state -eq "ready-for-finish") {
    Write-Host ""
    Write-Host "Phase 2/3a: Computing token deltas..." -ForegroundColor Green
    Write-Host ""
    & $benchRun -Phase finish -RunId $runId -Benchmark $currentBenchmark
    $state = "after-finish"
}

if ($state -eq "after-finish") {
    Write-Host ""
    Write-Host "Phase 2/3b: Running Playwright R1-R10 + capturing screenshots..." -ForegroundColor Green
    Write-Host ""
    & $judgeRun -RunId $runId -Benchmark $currentBenchmark
    $state = "after-judge"
}

# ============================================================
# Manual checkpoint B -- user runs qualitative pass via agent
# ============================================================

if ($state -eq "after-judge") {
    $resultsDir = Join-Path $repoRoot "benchmarks\$currentBenchmark\results\runs\$runId"
    $promptFiles = Get-ChildItem -Path $resultsDir -Filter "judge-prompt-*.md" -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "Qualitative pass needed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Paste the contents of EACH of these files into a multimodal coding agent of your choice:" -ForegroundColor Yellow
    foreach ($f in $promptFiles) {
        Write-Host "  $($f.FullName)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Use the SAME agent for all tools so scoring bias is uniform." -ForegroundColor Yellow
    Write-Host "Each agent invocation will fill in the 1-5 quality scores in the corresponding <tool>/judge.md." -ForegroundColor Yellow
    Wait-ForEnter "Press ENTER when every <tool>/judge.md has its 1-5 quality scores filled in for all 5 dimensions."
    $state = "after-qualitative"
}

# ============================================================
# Phase 3 -- summarize
# ============================================================

if ($state -eq "after-qualitative") {
    Write-Host ""
    $judgeAgent = Read-Host "Which agent did the qualitative scoring? (e.g. claude-opus-4-7)"
    if ([string]::IsNullOrWhiteSpace($judgeAgent)) {
        throw "JudgeAgent name is required for the final summary."
    }
    Write-Host ""
    Write-Host "Phase 3/3: Computing composite ranking..." -ForegroundColor Green
    Write-Host ""
    & $judgeSummarize -RunId $runId -Benchmark $currentBenchmark -JudgeAgent $judgeAgent
    $state = "complete"
}

# ============================================================
# Done
# ============================================================

if ($state -eq "complete") {
    $resultsDir = Join-Path $repoRoot "benchmarks\$currentBenchmark\results\runs\$runId"
    $finalMd    = Join-Path $resultsDir "$runId.md"
    Write-Host ""
    Write-Host "Benchmark complete: $currentBenchmark" -ForegroundColor Green
    Write-Host "  $finalMd" -ForegroundColor Yellow
    Write-Host ""
}

} # end foreach $currentBenchmark

if ($totalBenchmarks -gt 1) {
    Write-Host ""
    Write-Host "All $totalBenchmarks benchmarks complete." -ForegroundColor Green
    Write-Host ""
}
