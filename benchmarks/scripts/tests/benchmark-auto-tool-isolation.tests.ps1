<#
.SYNOPSIS
  Regression test for benchmark tool config isolation in unattended runs.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$benchmarkScript = Join-Path $repoRoot "benchmarks\scripts\benchmark-auto.ps1"
$scriptText = Get-Content $benchmarkScript -Raw -Encoding utf8

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($benchmarkScript, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
    throw "Failed to parse ${benchmarkScript}: $($errors[0].Message)"
}

$newInvocationScript = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq "New-InvocationScript"
}, $true)

if (-not $newInvocationScript) {
    throw "Could not find New-InvocationScript in $benchmarkScript"
}

$functionText = $newInvocationScript.Extent.Text
if ($functionText -notmatch '--strict-mcp-config') {
    throw "Claude invocation must use --strict-mcp-config so user/global MCP servers cannot spawn during unattended benchmarks."
}

if ($functionText -notmatch '--mcp-config') {
    throw "Claude invocation must pass a benchmark-local MCP config."
}

if ($functionText -notmatch '"mcpServers"\s*:\s*\{\s*\}') {
    throw "Claude benchmark MCP config must be empty."
}

if ($functionText -match '--bare') {
    throw "Claude invocation must not use --bare because it can bypass normal auth sources and break fair automated runs."
}

if ($scriptText -notmatch '-Arguments\s+@\(\s*"-NoProfile"\s*,\s*"-File"\s*,\s*\$invokeScriptPath\s*\)') {
    throw "Benchmark tool invocation must run pwsh with -NoProfile before -File."
}

Write-Host "PASS benchmark-auto tool config isolation regression" -ForegroundColor Green
