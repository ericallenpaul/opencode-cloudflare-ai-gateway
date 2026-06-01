<#
.SYNOPSIS
  Regression tests for benchmark-auto.ps1 prompt generation.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$benchmarkScript = Join-Path $repoRoot "benchmarks\scripts\benchmark-auto.ps1"
$runId = "prompt-regression-test"
$scratchDir = Join-Path $repoRoot "benchmarks\runs\$runId"
$resultDir = Join-Path $repoRoot "benchmarks\markdown-editor\results\runs\$runId"
$promptPath = Join-Path $scratchDir "markdown-editor\opencode\PROMPT.md"
$workspaceDir = Join-Path $scratchDir "markdown-editor\opencode\workspace"
$tttResultDir = Join-Path $repoRoot "benchmarks\tic-tac-toe\results\runs\$runId"
$tttPromptPath = Join-Path $scratchDir "tic-tac-toe\opencode\PROMPT.md"
$tttWorkspaceDir = Join-Path $scratchDir "tic-tac-toe\opencode\workspace"

function Assert-Contains {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$Expected
    )

    if (-not $Text.Contains($Expected)) {
        throw "Expected generated prompt to contain: $Expected"
    }
}

function Assert-NotContains {
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$Unexpected
    )

    if ($Text.Contains($Unexpected)) {
        throw "Generated prompt still contains forbidden text: $Unexpected"
    }
}

try {
    Remove-Item -LiteralPath $scratchDir, $resultDir, $tttResultDir -Recurse -Force -ErrorAction SilentlyContinue

    # --- architecture mode (markdown-editor): workspace + routing contract both present ---
    & $benchmarkScript `
        -Benchmark markdown-editor `
        -Tools opencode `
        -RunId $runId `
        -DryRun `
        -SkipJudge | Out-Null

    if (-not (Test-Path $promptPath)) {
        throw "Expected dry run to create prompt at: $promptPath"
    }

    $prompt = Get-Content $promptPath -Raw -Encoding utf8

    Assert-Contains -Text $prompt -Expected "Benchmark workspace: $workspaceDir."
    Assert-Contains -Text $prompt -Expected "Before writing files or running tests, verify the current directory is exactly this workspace."
    Assert-Contains -Text $prompt -Expected "create deliverables with bare filenames only"
    Assert-Contains -Text $prompt -Expected "Do not recreate the workspace path as nested directories."
    Assert-Contains -Text $prompt -Expected "When delegating via the Task tool, explicitly tell the subagent to work only in the benchmark workspace above"
    Assert-Contains -Text $prompt -Expected "AUTOMATED BENCHMARK CONTRACT"
    Assert-Contains -Text $prompt -Expected "This target policy mode is architecture."
    Assert-NotContains -Text $prompt -Unexpected "subagent inherits the correct working directory automatically"

    Write-Host "PASS benchmark-auto prompt workspace regression (architecture mode)"

    # --- tool mode (tic-tac-toe): workspace instruction present, routing contract absent ---
    & $benchmarkScript `
        -Benchmark tic-tac-toe `
        -Tools opencode `
        -RunId $runId `
        -DryRun `
        -SkipJudge | Out-Null

    if (-not (Test-Path $tttPromptPath)) {
        throw "Expected dry run to create prompt at: $tttPromptPath"
    }

    $tttPrompt = Get-Content $tttPromptPath -Raw -Encoding utf8

    Assert-Contains -Text $tttPrompt -Expected "Benchmark workspace: $tttWorkspaceDir."
    Assert-Contains -Text $tttPrompt -Expected "Before writing files or running tests, verify the current directory is exactly this workspace."
    Assert-Contains -Text $tttPrompt -Expected "create deliverables with bare filenames only"
    Assert-Contains -Text $tttPrompt -Expected "Do not recreate the workspace path as nested directories."
    Assert-Contains -Text $tttPrompt -Expected "When delegating via the Task tool, explicitly tell the subagent to work only in the benchmark workspace above"
    Assert-NotContains -Text $tttPrompt -Unexpected "AUTOMATED BENCHMARK CONTRACT"
    Assert-NotContains -Text $tttPrompt -Unexpected "This target policy mode is architecture."
    Assert-NotContains -Text $tttPrompt -Unexpected "subagent inherits the correct working directory automatically"

    Write-Host "PASS benchmark-auto prompt workspace regression (tool mode)"
}
finally {
    Remove-Item -LiteralPath $scratchDir, $resultDir, $tttResultDir -Recurse -Force -ErrorAction SilentlyContinue
}
