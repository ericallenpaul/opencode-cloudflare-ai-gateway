<#
.SYNOPSIS
  Run the functional (R1-R10) judge across all tools for a benchmark RunId,
  then stub per-tool judge.md files and a cross-tool comparison grid.

.DESCRIPTION
  Single-phase workflow. Point it at a RunId that bench-run.ps1 already produced,
  and it judges every tool's tictactoe.html with Playwright, resolves R9/R10
  via `node --test`, writes _judge-functional.json per tool, stubs judge.md
  per tool, and writes a cross-tool <RunId>-judge.md at the RunId level.

.PARAMETER RunId
  The RunId folder name under benchmarks/tic-tac-toe/results/runs/.
  Example: 2026-05-21-0818

.PARAMETER Benchmark
  Benchmark folder name under benchmarks/. Default: tic-tac-toe.

.EXAMPLE
  .\judge-run.ps1 -RunId 2026-05-21-0818

.NOTES
  Requirements:
    - Node.js 18+ in PATH
    - benchmarks/scripts/judge/node_modules must exist (run `npm install` there first)
    - `npx playwright install chromium` must have been run
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$RunId,

    [string]$Benchmark = "tic-tac-toe"
)

$ErrorActionPreference = "Stop"

# ============================================================
# Paths
# ============================================================

# Script lives at <repo>/benchmarks/scripts/judge-run.ps1
$repoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$judgeDir   = Join-Path $PSScriptRoot "judge"
$resultsDir = Join-Path $repoRoot "benchmarks\$Benchmark\results\runs\$RunId"
$targetDir  = Join-Path $repoRoot "benchmarks\$Benchmark"

# ============================================================
# Convention-based spec discovery
# ============================================================
# Each target lives at benchmarks/<target>/ and its Playwright spec is at
# benchmarks/scripts/judge/tests/<target>.spec.js. To add a new target:
#   1. Create benchmarks/<target>/ with PROMPT.md, SPEC.md, METHODOLOGY.md
#   2. Create tests/<target>.spec.js (Playwright deterministic R1-R10)
# No edits to this script are required.

$specFile = "$Benchmark.spec.js"
$specPath = Join-Path $judgeDir "tests\$specFile"
if (-not (Test-Path $specPath)) {
    Write-Host "ERROR: no Playwright spec found for benchmark '$Benchmark'." -ForegroundColor Red
    Write-Host "  Expected: $specPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To add this benchmark target, create the spec file at the above path." -ForegroundColor Yellow
    Write-Host "Use tests/tic-tac-toe.spec.js as a template." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $targetDir)) {
    Write-Host "ERROR: benchmark target directory not found:" -ForegroundColor Red
    Write-Host "  $targetDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "See benchmarks/README.md for the target convention." -ForegroundColor Yellow
    exit 1
}

# ============================================================
# Preflight checks
# ============================================================

Write-Host ""
Write-Host "Judge" -ForegroundColor Cyan
Write-Host "====="
Write-Host "  RunId:      $RunId"
Write-Host "  Benchmark:  $Benchmark"
Write-Host "  SpecFile:   $specFile"
Write-Host "  ResultsDir: $resultsDir"
Write-Host ""

if (-not (Test-Path $resultsDir)) {
    Write-Host "ERROR: results directory not found:" -ForegroundColor Red
    Write-Host "  $resultsDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "Run bench-run.ps1 -Phase finish -RunId $RunId first." -ForegroundColor Yellow
    exit 1
}

$nodeModules = Join-Path $judgeDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "ERROR: node_modules not found in judge directory." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install dependencies first:" -ForegroundColor Yellow
    Write-Host "  cd `"$judgeDir`"" -ForegroundColor Yellow
    Write-Host "  npm install" -ForegroundColor Yellow
    Write-Host "  npx playwright install chromium" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# Discover tools -- any subdir of the RunId dir that contains output/
# ============================================================

$toolDirs = Get-ChildItem -Path $resultsDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "output") }

if (-not $toolDirs -or $toolDirs.Count -eq 0) {
    Write-Host "ERROR: no tool subdirectories with output/ found under $resultsDir" -ForegroundColor Red
    exit 1
}

$toolNames = @($toolDirs | ForEach-Object { $_.Name })
Write-Host "Tools discovered: $($toolNames -join ', ')" -ForegroundColor DarkGray
Write-Host ""

# ============================================================
# Per-tool processing
# ============================================================

$toolResults = @()

foreach ($toolDir in $toolDirs) {
    $toolName   = $toolDir.Name
    $outputDir  = Join-Path $toolDir.FullName "output"
    $screensDir = Join-Path $toolDir.FullName "_screenshots"
    $judgeJson  = Join-Path $toolDir.FullName "_judge-functional.json"

    Write-Host "Judging: $toolName" -ForegroundColor Cyan
    Write-Host "  OutputDir:  $outputDir"

    # Find HTML file: any .html in output that doesn't look like a test file
    $htmlFile = Get-ChildItem -Path $outputDir -Filter "*.html" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch 'test' } |
        Select-Object -First 1

    if (-not $htmlFile) {
        # Last resort: any .html
        $htmlFile = Get-ChildItem -Path $outputDir -Filter "*.html" -ErrorAction SilentlyContinue |
            Select-Object -First 1
    }

    if (-not $htmlFile) {
        Write-Host "  [skip] no .html file found in $outputDir" -ForegroundColor Yellow
        $toolResults += [PSCustomObject]@{
            Tool         = $toolName
            Skipped      = $true
            SkipReason   = "no HTML file"
            HtmlPath     = $null
            TestFile     = $null
            PlaywrightOk = $false
            R9Status     = 'FAIL'
            R10Status    = 'FAIL'
            JudgeJsonPath = $null
            JudgeMdPath  = $null
        }
        continue
    }

    Write-Host "  HtmlFile:   $($htmlFile.FullName)"

    # Find test file
    $testFile = Get-ChildItem -Path $outputDir -Filter "*.test.js" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $testFile) {
        $testFile = Get-ChildItem -Path $outputDir -Filter "*.test.mjs" -ErrorAction SilentlyContinue |
            Select-Object -First 1
    }
    if ($testFile) {
        Write-Host "  TestFile:   $($testFile.FullName)"
    } else {
        Write-Host "  TestFile:   (none found)" -ForegroundColor DarkGray
    }

    # Create screenshots dir
    New-Item -ItemType Directory -Force -Path $screensDir | Out-Null

    # Set env vars for Playwright
    # Generic vars (used by all specs)
    $env:JUDGE_OUTPUT_JSON           = $judgeJson
    $env:PLAYWRIGHT_SCREENSHOTS_DIR  = $screensDir
    # Benchmark-specific vars (each spec reads its own prefix)
    $env:TICTACTOE_HTML              = $htmlFile.FullName
    $env:TICTACTOE_TOOL_NAME         = $toolName
    $env:TICTACTOE_TESTS             = if ($testFile) { $testFile.FullName } else { '' }
    $env:MARKDOWN_HTML               = $htmlFile.FullName
    $env:MARKDOWN_TOOL_NAME          = $toolName
    $env:MARKDOWN_TESTS              = if ($testFile) { $testFile.FullName } else { '' }

    # Initialize a minimal JSON so the spec can always merge
    if (-not (Test-Path $judgeJson)) {
        @{
            tool        = $toolName
            htmlPath    = $htmlFile.FullName
            results     = @{}
            consoleErrors = @()
            jsErrors    = @()
            screenshots = @()
        } | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $judgeJson
    }

    # Run Playwright -- pass the specific spec file for this benchmark
    Write-Host "  Running Playwright tests ($specFile)..." -ForegroundColor DarkGray
    $pwExitCode = 0
    try {
        Push-Location $judgeDir
        & npx playwright test $specFile 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        $pwExitCode = $LASTEXITCODE
    } catch {
        $pwExitCode = 99
        Write-Host "  Playwright invocation error: $_" -ForegroundColor Yellow
    } finally {
        Pop-Location
    }

    if ($pwExitCode -ne 0) {
        Write-Host "  WARNING: Playwright exited $pwExitCode (this means Playwright itself crashed," -ForegroundColor Yellow
        Write-Host "           not that R1-R10 failed -- check last-run.json in $judgeDir)" -ForegroundColor Yellow
    } else {
        Write-Host "  Playwright completed OK" -ForegroundColor Green
    }

    # ---- R9 / R10: run node --test ------------------------------------------

    $r9Status  = 'FAIL'
    $r9Reason  = 'No test file found in output/'
    $r10Status = 'FAIL'
    $r10Reason = 'No test file found in output/'

    if ($testFile) {
        $r9Status = 'PASS'
        $r9Reason = "Test file found: $($testFile.Name)"
        Write-Host "  Running node --test $($testFile.Name)..." -ForegroundColor DarkGray

        $nodeOutput = $null
        $nodeExitCode = 0
        try {
            Push-Location $outputDir
            $nodeOutput = & node --test $testFile.Name 2>&1 | Out-String
            $nodeExitCode = $LASTEXITCODE
        } catch {
            $nodeExitCode = 99
            $nodeOutput = "node --test invocation error: $_"
        } finally {
            Pop-Location
        }

        if ($nodeExitCode -eq 0) {
            $r10Status = 'PASS'
            $r10Reason = "node --test exited 0 (all tests passed)"
        } else {
            $r10Status = 'FAIL'
            $r10Reason = "node --test exited $nodeExitCode"
        }
        Write-Host "  R9=$r9Status  R10=$r10Status (exit $nodeExitCode)" -ForegroundColor DarkGray
    } else {
        Write-Host "  R9=FAIL  R10=FAIL (no test file)" -ForegroundColor DarkGray
    }

    # Patch R9/R10 into the judge JSON
    try {
        $existing = @{}
        if (Test-Path $judgeJson) {
            $raw = Get-Content $judgeJson -Raw -Encoding utf8
            $existing = $raw | ConvertFrom-Json
        }
        # ConvertFrom-Json returns PSCustomObject; convert results to hashtable for merging
        $resultsHash = @{}
        if ($existing.results) {
            $existing.results.PSObject.Properties | ForEach-Object {
                $resultsHash[$_.Name] = @{ status = $_.Value.status; reason = $_.Value.reason }
            }
        }
        $resultsHash['R9']  = @{ status = $r9Status;  reason = $r9Reason  }
        $resultsHash['R10'] = @{ status = $r10Status; reason = $r10Reason }

        $merged = [ordered]@{
            tool          = if ($existing.tool)     { $existing.tool     } else { $toolName }
            htmlPath      = if ($existing.htmlPath) { $existing.htmlPath } else { $htmlFile.FullName }
            results       = $resultsHash
            consoleErrors = if ($existing.consoleErrors) { $existing.consoleErrors } else { @() }
            jsErrors      = if ($existing.jsErrors)      { $existing.jsErrors      } else { @() }
            screenshots   = if ($existing.screenshots)   { $existing.screenshots   } else { @() }
        }
        $merged | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $judgeJson
    } catch {
        Write-Host "  WARNING: failed to patch R9/R10 into judge JSON: $_" -ForegroundColor Yellow
    }

    $toolResults += [PSCustomObject]@{
        Tool          = $toolName
        Skipped       = $false
        SkipReason    = $null
        HtmlPath      = $htmlFile.FullName
        TestFile      = if ($testFile) { $testFile.FullName } else { $null }
        PlaywrightOk  = ($pwExitCode -eq 0)
        R9Status      = $r9Status
        R10Status     = $r10Status
        JudgeJsonPath = $judgeJson
        JudgeMdPath   = (Join-Path $toolDir.FullName "judge.md")
    }

    Write-Host ""
}

# Clear env vars (courteous cleanup)
Remove-Item Env:\JUDGE_OUTPUT_JSON          -ErrorAction SilentlyContinue
Remove-Item Env:\PLAYWRIGHT_SCREENSHOTS_DIR -ErrorAction SilentlyContinue
Remove-Item Env:\TICTACTOE_HTML             -ErrorAction SilentlyContinue
Remove-Item Env:\TICTACTOE_TOOL_NAME        -ErrorAction SilentlyContinue
Remove-Item Env:\TICTACTOE_TESTS            -ErrorAction SilentlyContinue
Remove-Item Env:\MARKDOWN_HTML              -ErrorAction SilentlyContinue
Remove-Item Env:\MARKDOWN_TOOL_NAME         -ErrorAction SilentlyContinue
Remove-Item Env:\MARKDOWN_TESTS             -ErrorAction SilentlyContinue

# ============================================================
# Helper: read results from judge JSON safely
# ============================================================

function Get-CriterionStatus {
    param(
        [string]$JsonPath,
        [string]$Criterion
    )
    if (-not $JsonPath -or -not (Test-Path $JsonPath)) { return 'N/A' }
    try {
        $obj = Get-Content $JsonPath -Raw -Encoding utf8 | ConvertFrom-Json
        $r = $obj.results
        if (-not $r) { return 'N/A' }
        $v = $r.PSObject.Properties[$Criterion]
        if ($v) { return $v.Value.status } else { return 'N/A' }
    } catch { return 'N/A' }
}

function Get-CriterionReason {
    param(
        [string]$JsonPath,
        [string]$Criterion
    )
    if (-not $JsonPath -or -not (Test-Path $JsonPath)) { return '' }
    try {
        $obj = Get-Content $JsonPath -Raw -Encoding utf8 | ConvertFrom-Json
        $r = $obj.results
        if (-not $r) { return '' }
        $v = $r.PSObject.Properties[$Criterion]
        if ($v) { return $v.Value.reason } else { return '' }
    } catch { return '' }
}

function Count-Passes {
    param([string]$JsonPath)
    if (-not $JsonPath -or -not (Test-Path $JsonPath)) { return 0 }
    try {
        $obj = Get-Content $JsonPath -Raw -Encoding utf8 | ConvertFrom-Json
        $r = $obj.results
        if (-not $r) { return 0 }
        $count = 0
        foreach ($p in $r.PSObject.Properties) {
            if ($p.Value.status -eq 'PASS') { $count++ }
        }
        return $count
    } catch { return 0 }
}

# ============================================================
# Stub per-tool judge.md
# ============================================================

$criteria = @('R1','R2','R3','R4','R5','R6','R7','R8','R9','R10')

foreach ($tr in $toolResults) {
    if ($tr.Skipped) { continue }

    $judgeMd = $tr.JudgeMdPath
    if (Test-Path $judgeMd) {
        Write-Host "judge.md already exists for $($tr.Tool), skipping stub generation." -ForegroundColor DarkGray
        continue
    }

    $passCount = Count-Passes $tr.JudgeJsonPath

    $tableRows = foreach ($c in $criteria) {
        $st  = Get-CriterionStatus $tr.JudgeJsonPath $c
        $rsn = Get-CriterionReason $tr.JudgeJsonPath $c
        # Escape pipes in reason text
        $rsn = $rsn -replace '\|', '\|'
        "| $c | $st | $rsn | |"
    }

    $judgeStub = @"
# Judge: $($tr.Tool) -- $RunId

_Generated by judge-run.ps1 + agent qualitative pass pending_

## R1-R10 results

| Criterion | Status | Reason (functional test) | Qualitative note |
|---|---|---|---|
$($tableRows -join "`n")

**Required passed**: $passCount / 10

## Quality scores (1-5)

| Dimension     | Score | Justification |
|---|---|---|
| Readability   |       |               |
| Test breadth  |       |               |
| UX polish     |       |               |
| Defensiveness |       |               |
| Documentation |       |               |

**Average**:

## Observations

- (agent to fill in)

## Bug list

None found.
"@

    $judgeStub | Set-Content -Encoding utf8 -Path $judgeMd
    Write-Host "  Stubbed: $judgeMd" -ForegroundColor DarkGray
}

# ============================================================
# Cross-tool comparison: <RunId>-judge.md
# ============================================================

$crossToolMd = Join-Path $resultsDir "$RunId-judge.md"

$mdLines = @()
$mdLines += "# Judge: $RunId -- cross-tool comparison"
$mdLines += ""
$mdLines += "_Generated by judge-run.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')_"
$mdLines += "_Qualitative scores (shaded columns) require an agent pass -- see JUDGE-PROMPT.md_"
$mdLines += ""
$mdLines += "## R1-R10 functional results"
$mdLines += ""

# Header row
$headerCols = "| Criterion |"
$sepCols    = "|---|"
foreach ($tr in $toolResults) {
    $headerCols += " $($tr.Tool) |"
    $sepCols    += "---|"
}
$mdLines += $headerCols
$mdLines += $sepCols

foreach ($c in $criteria) {
    $row = "| $c |"
    foreach ($tr in $toolResults) {
        $st = if ($tr.Skipped) { 'SKIP' } else { Get-CriterionStatus $tr.JudgeJsonPath $c }
        $row += " $st |"
    }
    $mdLines += $row
}

# Pass counts
$passRow = "| **PASS count** |"
foreach ($tr in $toolResults) {
    $n = if ($tr.Skipped) { '-' } else { Count-Passes $tr.JudgeJsonPath }
    $passRow += " $n / 10 |"
}
$mdLines += $passRow
$mdLines += ""
$mdLines += "## Quality scores (agent to fill in)"
$mdLines += ""

$qHeader = "| Dimension |"
$qSep    = "|---|"
foreach ($tr in $toolResults) {
    $qHeader += " $($tr.Tool) |"
    $qSep    += "---|"
}
$mdLines += $qHeader
$mdLines += $qSep

foreach ($dim in @('Readability', 'Test breadth', 'UX polish', 'Defensiveness', 'Documentation', '**Average**')) {
    $row = "| $dim |"
    foreach ($tr in $toolResults) {
        $row += "  |"
    }
    $mdLines += $row
}

$mdLines += ""
$mdLines += "## Artifacts"
$mdLines += ""
$mdLines += "| Tool | HTML | Functional JSON | Screenshots | Judge stub |"
$mdLines += "|---|---|---|---|---|"
foreach ($tr in $toolResults) {
    if ($tr.Skipped) {
        $mdLines += "| $($tr.Tool) | (skipped: $($tr.SkipReason)) | - | - | - |"
    } else {
        $mdLines += "| $($tr.Tool) | [tictactoe.html]($($tr.Tool)/output/) | [_judge-functional.json]($($tr.Tool)/_judge-functional.json) | [_screenshots/]($($tr.Tool)/_screenshots/) | [judge.md]($($tr.Tool)/judge.md) |"
    }
}

$mdLines += ""
$mdLines += "## Next steps"
$mdLines += ""
$mdLines += "1. Open the JUDGE-PROMPT.md and substitute the placeholders."
$mdLines += "2. Paste the prompt into your preferred coding agent."
$mdLines += "3. Let the agent fill in each tool's judge.md (one paste per tool)."
$mdLines += "4. Return here and fill in the Quality scores table above."

($mdLines -join "`n") | Set-Content -Encoding utf8 -Path $crossToolMd

Write-Host "Cross-tool comparison written:" -ForegroundColor Green
Write-Host "  $crossToolMd" -ForegroundColor Yellow
Write-Host ""

# ============================================================
# Final summary
# ============================================================

Write-Host "Run $RunId judge summary" -ForegroundColor Green
Write-Host ("=" * 60) -ForegroundColor Green
Write-Host ("{0,-12} {1,10}  {2,6}  {3,6}" -f "Tool", "Playwright", "R9", "R10")
Write-Host ("{0,-12} {1,10}  {2,6}  {3,6}" -f "----", "----------", "--", "---")
foreach ($tr in $toolResults) {
    $pw = if ($tr.Skipped) { 'SKIP' } elseif ($tr.PlaywrightOk) { 'OK' } else { 'WARN' }
    Write-Host ("{0,-12} {1,10}  {2,6}  {3,6}" -f $tr.Tool, $pw, $tr.R9Status, $tr.R10Status)
}
Write-Host ""

# ============================================================
# Generate per-tool pre-substituted judge-prompt-<tool>.md files
# ============================================================
# JUDGE-PROMPT.md is a template with {{REPO_ROOT}}, {{RUN_ID}}, {{TOOL}},
# {{BENCHMARK}} placeholders. For each tool processed, write a ready-to-
# paste file at runs/<RunId>/judge-prompt-<tool>.md so the user doesn't
# have to do manual substitution before pasting into their chosen agent.

$promptTemplatePath = Join-Path $judgeDir "JUDGE-PROMPT.md"
$generatedPromptFiles = @()
if (Test-Path $promptTemplatePath) {
    $template = Get-Content -Raw -Path $promptTemplatePath
    foreach ($tr in ($toolResults | Where-Object { -not $_.Skipped })) {
        $rendered = $template `
            -replace '\{\{REPO_ROOT\}\}', $repoRoot `
            -replace '\{\{RUN_ID\}\}',   $RunId `
            -replace '\{\{TOOL\}\}',     $tr.Tool `
            -replace '\{\{BENCHMARK\}\}', $Benchmark
        $outPath = Join-Path $resultsDir "judge-prompt-$($tr.Tool).md"
        Set-Content -Encoding utf8 -Path $outPath -Value $rendered
        $generatedPromptFiles += $outPath
    }
}

# ============================================================
# Next steps block
# ============================================================

Write-Host "NEXT STEPS" -ForegroundColor Cyan
Write-Host "==========" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Per-tool judge.md stubs (functional R1-R10 pre-filled):" -ForegroundColor White
foreach ($tr in ($toolResults | Where-Object { -not $_.Skipped })) {
    Write-Host "     $($tr.JudgeMdPath)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "2. Cross-tool comparison:" -ForegroundColor White
Write-Host "     $crossToolMd" -ForegroundColor Yellow
Write-Host ""
Write-Host "3. Ready-to-paste qualitative prompts (one per tool, placeholders already substituted):" -ForegroundColor White
foreach ($f in $generatedPromptFiles) {
    Write-Host "     $f" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "   Open each one in a multimodal coding agent. The agent will fill in the soft" -ForegroundColor DarkGray
Write-Host "   scores in the corresponding <tool>/judge.md. Use the SAME agent across all" -ForegroundColor DarkGray
Write-Host "   tools so scoring bias stays uniform." -ForegroundColor DarkGray
Write-Host ""
