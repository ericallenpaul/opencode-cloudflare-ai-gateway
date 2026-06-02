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
$runScratchRoot = Join-Path $repoRoot "benchmarks\runs\$runId\markdown-editor"
$scratchDir = Join-Path $runScratchRoot "opencode"
$resultDir = Join-Path $repoRoot "benchmarks\markdown-editor\results\runs\$runId"
$promptPath = Join-Path $scratchDir "PROMPT.md"
$workspaceDir = Join-Path $scratchDir "workspace"
$workspaceOpencodeConfigPath = Join-Path $workspaceDir "opencode.json"

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
    if (Test-Path $runScratchRoot) { Remove-Item -LiteralPath $runScratchRoot -Recurse -Force }
    if (Test-Path $resultDir) { Remove-Item -LiteralPath $resultDir -Recurse -Force }

    & $benchmarkScript `
        -Benchmark markdown-editor `
        -Tools opencode `
        -RunId $runId `
        -DryRun `
        -SkipJudge | Out-Null

    if (-not (Test-Path $promptPath)) {
        throw "Expected dry run to create prompt at: $promptPath"
    }

    if (-not (Test-Path (Join-Path $workspaceDir ".git"))) {
        throw "Expected dry run workspace to be initialized as a git root: $workspaceDir"
    }

    if (-not (Test-Path $workspaceOpencodeConfigPath)) {
        throw "Expected dry run workspace to contain benchmark-local OpenCode config: $workspaceOpencodeConfigPath"
    }

    $opencodeConfig = Get-Content $workspaceOpencodeConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($opencodeConfig.PSObject.Properties["_comment_agents"]) {
        throw "Expected benchmark-local OpenCode config to strip example-only _comment_agents metadata."
    }
    if (-not $opencodeConfig.PSObject.Properties["agent"] -or -not $opencodeConfig.agent.PSObject.Properties["build"]) {
        throw "Expected benchmark-local OpenCode config to preserve the build agent."
    }
    if (-not $opencodeConfig.PSObject.Properties["plugin"]) {
        throw "Expected benchmark-local OpenCode config to preserve plugin configuration."
    }
    if (-not $opencodeConfig.PSObject.Properties["mcp"]) {
        throw "Expected benchmark-local OpenCode config to preserve MCP entries in disabled form."
    }
    foreach ($mcpServer in $opencodeConfig.mcp.PSObject.Properties) {
        if ($mcpServer.Value.enabled -ne $false) {
            throw "Expected benchmark-local MCP server '$($mcpServer.Name)' to be disabled."
        }
    }
    if (-not $opencodeConfig.mcp.PSObject.Properties["playwright"]) {
        throw "Expected benchmark-local OpenCode config to include disabled playwright MCP entry."
    }

    $resolvedWorkspaceDir = (Resolve-Path -LiteralPath $workspaceDir).Path
    $gitTopLevel = & git -C $workspaceDir rev-parse --show-toplevel
    if ($LASTEXITCODE -ne 0) {
        throw "Expected git rev-parse to succeed for workspace: $workspaceDir"
    }

    $resolvedGitTopLevel = (Resolve-Path -LiteralPath ($gitTopLevel.Trim())).Path
    if ($resolvedGitTopLevel -ne $resolvedWorkspaceDir) {
        throw "Expected git toplevel to resolve to workspace. Expected: $resolvedWorkspaceDir. Actual: $resolvedGitTopLevel"
    }

    $prompt = Get-Content $promptPath -Raw -Encoding utf8

    Assert-NotContains -Text $prompt -Unexpected ([System.IO.Path]::GetTempPath())

    Assert-Contains -Text $prompt -Expected "Benchmark workspace: $workspaceDir."
    Assert-Contains -Text $prompt -Expected "Before writing files or running tests, verify the current directory is exactly this workspace."
    Assert-Contains -Text $prompt -Expected "create deliverables with bare filenames only"
    Assert-Contains -Text $prompt -Expected "Do not recreate the workspace path as nested directories."
    Assert-Contains -Text $prompt -Expected "When delegating via the Task tool, explicitly tell the subagent to work only in the benchmark workspace above"
    Assert-Contains -Text $prompt -Expected "do not invoke superpowers:brainstorming"
    Assert-Contains -Text $prompt -Expected "do not pause for human approval or clarification"
    Assert-Contains -Text $prompt -Expected "do not use Playwright MCP, browser MCP tools, or browser smoke tests"
    Assert-Contains -Text $prompt -Expected "This automated benchmark contract is the complete approved design/spec for this run."
    Assert-Contains -Text $prompt -Expected "Do not invoke superpowers:brainstorming."
    Assert-Contains -Text $prompt -Expected "Skip any approval or clarification pauses"
    Assert-NotContains -Text $prompt -Unexpected "subagent inherits the correct working directory automatically"

    Write-Host "PASS benchmark-auto prompt workspace regression"
}
finally {
    if (Test-Path $runScratchRoot) { Remove-Item -LiteralPath $runScratchRoot -Recurse -Force }
    if (Test-Path $resultDir) { Remove-Item -LiteralPath $resultDir -Recurse -Force }
}
