<#
.SYNOPSIS
  Regression test for benchmark tool process launches without child console windows.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$benchmarkScript = Join-Path $repoRoot "benchmarks\scripts\benchmark-auto.ps1"

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($benchmarkScript, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
    throw "Failed to parse ${benchmarkScript}: $($errors[0].Message)"
}

$invokeLoggedProcess = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq "Invoke-LoggedProcess"
}, $true)

if (-not $invokeLoggedProcess) {
    throw "Could not find Invoke-LoggedProcess in $benchmarkScript"
}

$startProcessCommands = @($invokeLoggedProcess.FindAll({
    param($node)
    $node -is [System.Management.Automation.Language.CommandAst] -and
    $node.GetCommandName() -eq "Start-Process"
}, $true))

if ($startProcessCommands.Count -ne 0) {
    throw "Invoke-LoggedProcess must not use Start-Process; use ProcessStartInfo with CreateNoWindow instead."
}

$functionText = $invokeLoggedProcess.Extent.Text
if ($functionText -notmatch '(?i)CreateNoWindow\s*=\s*\$true') {
    throw "Invoke-LoggedProcess must set ProcessStartInfo.CreateNoWindow to true."
}

if ($functionText -notmatch '(?i)UseShellExecute\s*=\s*\$false') {
    throw "Invoke-LoggedProcess must set ProcessStartInfo.UseShellExecute to false."
}

if ($functionText -match '(?i)-NoNewWindow|-WindowStyle') {
    throw "Invoke-LoggedProcess must not rely on PowerShell window-style flags for benchmark tool subprocesses."
}

Write-Host "PASS benchmark-auto hidden window regression" -ForegroundColor Green
