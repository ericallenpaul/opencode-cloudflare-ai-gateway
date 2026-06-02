<#
.SYNOPSIS
  Regression test for benchmark-auto.ps1 timeout cleanup.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$benchmarkScript = Join-Path $repoRoot "benchmarks\scripts\benchmark-auto.ps1"

function Export-FunctionsFromScript {
    param(
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string[]]$FunctionNames
    )

    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$errors)
    if ($errors.Count -gt 0) {
        throw "Failed to parse ${ScriptPath}: $($errors[0].Message)"
    }

    $definitionPath = Join-Path ([System.IO.Path]::GetTempPath()) ("benchmark-auto-function-" + [guid]::NewGuid().ToString("N") + ".ps1")
    $definitions = foreach ($functionName in $FunctionNames) {
        $funcAst = $ast.Find({
                param($node)
                $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $FunctionName
            }, $true)
        if (-not $funcAst) {
            throw "Could not find function $functionName in ${ScriptPath}"
        }
        $funcAst.Extent.Text
    }

    Set-Content -LiteralPath $definitionPath -Value ($definitions -join "`r`n`r`n") -Encoding utf8
    return $definitionPath
}

function Wait-UntilProcessGone {
    param(
        [Parameter(Mandatory)][int]$ProcessId,
        [int]$TimeoutSeconds = 10
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
            return $true
        }
        Start-Sleep -Milliseconds 250
    }

    return -not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

$functionDefinitionPath = Export-FunctionsFromScript -ScriptPath $benchmarkScript -FunctionNames @(
    "Get-ChildProcessIds",
    "Stop-ProcessTree",
    "Invoke-LoggedProcess"
)
try {
    . $functionDefinitionPath

    $testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("benchmark-auto-timeout-" + [guid]::NewGuid().ToString("N"))
    $childScriptPath = Join-Path $testRoot "child.ps1"
    $wrapperScriptPath = Join-Path $testRoot "wrapper.ps1"
    $childPidPath = Join-Path $testRoot "child.pid"
    $childMarkerPath = Join-Path $testRoot "child.marker"
    $stdoutPath = Join-Path $testRoot "stdout.txt"
    $stderrPath = Join-Path $testRoot "stderr.txt"
    $childPid = $null

    try {
        New-Item -ItemType Directory -Force -Path $testRoot | Out-Null

        @'
param(
    [Parameter(Mandatory)][string]$PidPath,
    [Parameter(Mandatory)][string]$MarkerPath
)

Set-Content -LiteralPath $PidPath -Value $PID -Encoding ascii
Set-Content -LiteralPath $MarkerPath -Value "child-started" -Encoding ascii
Start-Sleep -Seconds 300
'@ | Set-Content -LiteralPath $childScriptPath -Encoding utf8

        @'
param(
    [Parameter(Mandatory)][string]$ChildScriptPath,
    [Parameter(Mandatory)][string]$PidPath,
    [Parameter(Mandatory)][string]$MarkerPath
)

$child = Start-Process -FilePath "pwsh" -ArgumentList @(
    "-NoProfile",
    "-File",
    $ChildScriptPath,
    "-PidPath",
    $PidPath,
    "-MarkerPath",
    $MarkerPath
) -PassThru

Wait-Process -Id $child.Id
'@ | Set-Content -LiteralPath $wrapperScriptPath -Encoding utf8

        $result = Invoke-LoggedProcess `
            -FilePath "pwsh" `
            -Arguments @(
                "-NoProfile",
                "-File",
                $wrapperScriptPath,
                "-ChildScriptPath",
                $childScriptPath,
                "-PidPath",
                $childPidPath,
                "-MarkerPath",
                $childMarkerPath
            ) `
            -WorkingDirectory $testRoot `
            -TimeoutSeconds 1 `
            -StdoutPath $stdoutPath `
            -StderrPath $stderrPath

        if (-not $result.timedOut) {
            throw "Expected timeout cleanup to report timedOut = true."
        }
        if ($result.exitCode -ne 124) {
            throw "Expected timeout cleanup to report exitCode 124, got $($result.exitCode)."
        }

        if (-not (Test-Path $childPidPath)) {
            throw "Expected child PID file to be written at $childPidPath."
        }

        $childPid = [int](Get-Content -LiteralPath $childPidPath -Raw -Encoding ascii)
        if (-not (Wait-UntilProcessGone -ProcessId $childPid -TimeoutSeconds 10)) {
            throw "Child process $childPid is still running after timeout cleanup."
        }

        Write-Host "PASS benchmark-auto timeout cleanup regression" -ForegroundColor Green
    }
    finally {
        if ($childPid) {
            Stop-Process -Id $childPid -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $testRoot) {
            Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
finally {
    if (Test-Path $functionDefinitionPath) {
        Remove-Item -LiteralPath $functionDefinitionPath -Force -ErrorAction SilentlyContinue
    }
}
