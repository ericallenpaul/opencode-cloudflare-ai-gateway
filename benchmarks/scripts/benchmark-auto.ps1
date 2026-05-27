<#
.SYNOPSIS
  Non-interactive benchmark runner for Claude, Codex, and OpenCode.

.DESCRIPTION
  Executes a benchmark target end-to-end using target-local policy.json rules.
  Each tool runs in an isolated scratch workspace, outputs are copied into the
  committed results layout, model/routing expectations are validated, and the
  deterministic Playwright judge is invoked automatically by default.
#>

[CmdletBinding()]
param(
    [string]$Benchmark = "tic-tac-toe",
    [string[]]$Tools,
    [string]$RunId,
    [switch]$SkipJudge,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$benchmarkDir = Join-Path $repoRoot "benchmarks\$Benchmark"
$policyPath = Join-Path $benchmarkDir "policy.json"
$promptPath = Join-Path $benchmarkDir "PROMPT.md"
$judgeScript = Join-Path $PSScriptRoot "judge-run.ps1"

if (-not (Test-Path $benchmarkDir)) { throw "Unknown benchmark target: $Benchmark" }
if (-not (Test-Path $policyPath)) { throw "Missing policy file: $policyPath" }
if (-not (Test-Path $promptPath)) { throw "Missing prompt file: $promptPath" }
if (-not $RunId) { $RunId = Get-Date -Format "yyyy-MM-dd-HHmmss" }

$policy = Get-Content $policyPath -Raw -Encoding utf8 | ConvertFrom-Json
$promptText = Get-Content $promptPath -Raw -Encoding utf8

$toolConfigs = @{
    claude = @{ commandName = "claude" }
    codex = @{ commandName = "codex" }
    opencode = @{ commandName = "opencode" }
}

function Get-Field {
    param(
        [Parameter(Mandatory)]$Obj,
        [Parameter(Mandatory)][string[]]$Keys,
        $Default = $null
    )
    foreach ($k in $Keys) {
        $prop = $Obj.PSObject.Properties[$k]
        if ($null -ne $prop -and $null -ne $prop.Value) { return $prop.Value }
    }
    return $Default
}

function Get-Sessions {
    param([Parameter(Mandatory)]$Obj)
    if ($Obj -is [System.Array]) { return $Obj }
    foreach ($key in @("sessions", "data", "entries", "items")) {
        if ($Obj.PSObject.Properties[$key]) { return @($Obj.$key) }
    }
    if (Get-Field $Obj @("sessionId", "session_id", "id")) { return @($Obj) }
    return @()
}

function Get-SessionId {
    param([Parameter(Mandatory)]$Session)
    $id = Get-Field $Session @("sessionId", "session_id", "id", "uuid")
    if ($id) { return [string]$id }
    $json = $Session | ConvertTo-Json -Compress -Depth 12
    return ([Security.Cryptography.SHA256]::Create().ComputeHash(
            [Text.Encoding]::UTF8.GetBytes($json)) | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Invoke-CcusageSnapshot {
    param(
        [Parameter(Mandatory)][string]$Tool,
        [Parameter(Mandatory)][string]$JsonPath,
        [Parameter(Mandatory)][string]$TextPath
    )
    & npx -y "ccusage@latest" $Tool "session" "--json" | Set-Content -Encoding utf8 $JsonPath
    if ($LASTEXITCODE -ne 0) { throw "ccusage failed for $Tool (json)" }
    & npx -y "ccusage@latest" $Tool "session" | Set-Content -Encoding utf8 $TextPath
    if ($LASTEXITCODE -ne 0) { throw "ccusage failed for $Tool (text)" }
}

function Get-ModelsFromSession {
    param([Parameter(Mandatory)]$Session)
    $models = @()
    $modelsUsed = Get-Field $Session @("modelsUsed")
    if ($modelsUsed) { $models += @($modelsUsed) }
    $breakdowns = Get-Field $Session @("modelBreakdowns")
    if ($breakdowns) {
        $models += @($breakdowns | ForEach-Object { $_.modelName } | Where-Object { $_ })
    }
    $modelHash = Get-Field $Session @("models")
    if ($modelHash) { $models += @($modelHash.PSObject.Properties.Name) }
    $single = Get-Field $Session @("modelName", "model")
    if ($single) { $models += @($single) }
    return @($models | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-SessionsDelta {
    param(
        [Parameter(Mandatory)]$BeforeJson,
        [Parameter(Mandatory)]$AfterJson
    )
    $beforeSessions = @(Get-Sessions $BeforeJson)
    $afterSessions = @(Get-Sessions $AfterJson)
    $beforeIds = @{}
    foreach ($s in $beforeSessions) { $beforeIds[(Get-SessionId $s)] = $true }
    $newSessions = @()
    foreach ($s in $afterSessions) {
        $id = Get-SessionId $s
        if (-not $beforeIds.ContainsKey($id)) { $newSessions += $s }
    }

    $summary = [ordered]@{
        sessionCount = $newSessions.Count
        sessionIds = @($newSessions | ForEach-Object { Get-SessionId $_ })
        actualModels = @()
        totals = [ordered]@{
            inputTokens = 0
            outputTokens = 0
            cacheReadTokens = 0
            cacheCreationTokens = 0
            cachedInputTokens = 0
            reasoningOutputTokens = 0
            totalTokens = 0
            totalCost = 0.0
        }
    }

    $modelSet = New-Object System.Collections.Generic.HashSet[string]
    foreach ($s in $newSessions) {
        foreach ($m in (Get-ModelsFromSession $s)) { [void]$modelSet.Add([string]$m) }
        $summary.totals.inputTokens += [double](Get-Field $s @("inputTokens") 0)
        $summary.totals.outputTokens += [double](Get-Field $s @("outputTokens") 0)
        $summary.totals.cacheReadTokens += [double](Get-Field $s @("cacheReadTokens") 0)
        $summary.totals.cacheCreationTokens += [double](Get-Field $s @("cacheCreationTokens") 0)
        $summary.totals.cachedInputTokens += [double](Get-Field $s @("cachedInputTokens") 0)
        $summary.totals.reasoningOutputTokens += [double](Get-Field $s @("reasoningOutputTokens") 0)
        $summary.totals.totalTokens += [double](Get-Field $s @("totalTokens") 0)
        $summary.totals.totalCost += [double](Get-Field $s @("totalCost", "costUSD", "cost") 0)
    }
    $summary.actualModels = @($modelSet | Sort-Object)
    return @{
        sessions = $newSessions
        summary = $summary
    }
}

function Find-Matches {
    param(
        [Parameter(Mandatory)][string]$BaseDir,
        [Parameter(Mandatory)][string[]]$Patterns
    )
    $matches = @()
    foreach ($pattern in $Patterns) {
        $matches += Get-ChildItem -Path $BaseDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $pattern }
    }
    return @($matches | Sort-Object FullName -Unique)
}

function Test-ExpectedOutputs {
    param(
        [Parameter(Mandatory)][string]$WorkspaceDir,
        [Parameter(Mandatory)]$ExpectedOutputs
    )
    $found = [ordered]@{}
    $missing = @()
    foreach ($prop in $ExpectedOutputs.PSObject.Properties) {
        $matches = @(Find-Matches -BaseDir $WorkspaceDir -Patterns @($prop.Value))
        $found[$prop.Name] = @($matches | ForEach-Object { $_.FullName })
        if ($matches.Count -eq 0) { $missing += $prop.Name }
    }
    return @{
        found = $found
        missing = $missing
        valid = ($missing.Count -eq 0)
    }
}

function Copy-WorkspaceOutputs {
    param(
        [Parameter(Mandatory)][string]$WorkspaceDir,
        [Parameter(Mandatory)][string]$OutputDir
    )
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
    $items = Get-ChildItem -Path $WorkspaceDir -Force -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        Copy-Item -Path $item.FullName -Destination (Join-Path $OutputDir $item.Name) -Recurse -Force
    }
}

function Invoke-LoggedProcess {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][int]$TimeoutSeconds,
        [Parameter(Mandatory)][string]$StdoutPath,
        [Parameter(Mandatory)][string]$StderrPath,
        [hashtable]$EnvironmentOverrides
    )

    $previous = @{}
    if ($EnvironmentOverrides) {
        foreach ($key in $EnvironmentOverrides.Keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
            [Environment]::SetEnvironmentVariable($key, [string]$EnvironmentOverrides[$key], "Process")
        }
    }

    try {
        $proc = Start-Process -FilePath $FilePath `
            -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $StdoutPath `
            -RedirectStandardError $StderrPath `
            -PassThru `
            -NoNewWindow

        $timedOut = $false
        try {
            Wait-Process -Id $proc.Id -Timeout $TimeoutSeconds -ErrorAction Stop
        } catch {
            $timedOut = $true
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
        $proc.Refresh()
        return @{
            exitCode = if ($timedOut) { 124 } else { $proc.ExitCode }
            timedOut = $timedOut
        }
    } finally {
        if ($EnvironmentOverrides) {
            foreach ($key in $EnvironmentOverrides.Keys) {
                [Environment]::SetEnvironmentVariable($key, $previous[$key], "Process")
            }
        }
    }
}

function Get-LogModelsFallback {
    param([Parameter(Mandatory)][string]$LogPath)
    if (-not (Test-Path $LogPath)) { return @() }
    $text = Get-Content $LogPath -Raw -Encoding utf8
    if ([string]::IsNullOrWhiteSpace($text)) { return @() }
    $matches = [regex]::Matches($text, '(?:"model(?:Name)?"\s*:\s*"|modelsUsed"\s*:\s*\[\s*")([^"]+)')
    $models = @()
    foreach ($m in $matches) { $models += $m.Groups[1].Value }
    return @($models | Where-Object { $_ } | Sort-Object -Unique)
}

function Resolve-LaunchCommand {
    param(
        [Parameter(Mandatory)][string]$CommandName,
        [Parameter(Mandatory)][string[]]$Arguments
    )
    $cmd = Get-Command $CommandName -ErrorAction Stop
    $path = $cmd.Path
    if ($path -and $path.EndsWith(".ps1", [System.StringComparison]::OrdinalIgnoreCase)) {
        return @{
            filePath = "pwsh"
            arguments = @("-File", $path) + $Arguments
        }
    }
    return @{
        filePath = if ($path) { $path } else { $CommandName }
        arguments = $Arguments
    }
}

function New-InvocationScript {
    param(
        [Parameter(Mandatory)][string]$Tool,
        [Parameter(Mandatory)][string]$RequestedModel,
        [Parameter(Mandatory)][string]$PromptPath,
        [Parameter(Mandatory)][string]$WorkspaceDir,
        [Parameter(Mandatory)][string]$ScriptPath
    )

    $repoLeaf = Split-Path -Leaf $repoRoot
    $escapedPrompt = $PromptPath.Replace("'", "''")
    $escapedWorkspace = $WorkspaceDir.Replace("'", "''")
    $escapedModel = $RequestedModel.Replace("'", "''")
    $escapedAppTag = $repoLeaf.Replace("'", "''")

    $body = switch ($Tool) {
        "claude" {
@"
Set-Location '$escapedWorkspace'
`$ErrorActionPreference = 'Stop'
`$prompt = Get-Content '$escapedPrompt' -Raw -Encoding utf8
& claude -p --output-format json --permission-mode bypassPermissions --model '$escapedModel' `$prompt
exit `$LASTEXITCODE
"@
        }
        "codex" {
@"
Set-Location '$escapedWorkspace'
`$ErrorActionPreference = 'Stop'
`$prompt = Get-Content '$escapedPrompt' -Raw -Encoding utf8
& codex exec --json --dangerously-bypass-approvals-and-sandbox --model '$escapedModel' `$prompt
exit `$LASTEXITCODE
"@
        }
        "opencode" {
@"
Set-Location '$escapedWorkspace'
`$ErrorActionPreference = 'Stop'
`$env:OPENCODE_APP_TAG = '$escapedAppTag'
`$prompt = Get-Content '$escapedPrompt' -Raw -Encoding utf8
& opencode run --agent build --format json --dangerously-skip-permissions `$prompt
exit `$LASTEXITCODE
"@
        }
        default {
            throw "No invocation script template for tool: $Tool"
        }
    }

    Set-Content -Path $ScriptPath -Value $body -Encoding utf8
}

function Test-PolicyCompliance {
    param(
        [Parameter(Mandatory)]$ToolPolicy,
        [string[]]$ActualModels,
        [Parameter(Mandatory)][bool]$RequireRouting,
        [Parameter(Mandatory)][string]$RequestedModel,
        [string]$CombinedLogText = ""
    )
    $reasons = @()
    if ($CombinedLogText -match "not supported when using Codex with a ChatGPT account") {
        $reasons += "requested model rejected by local Codex account"
    }
    if ($CombinedLogText -match "401 Unauthorized|Missing bearer or basic authentication") {
        $reasons += "tool authentication failed"
    }
    if ($CombinedLogText -match "invalid model|unknown model|model .* not found") {
        $reasons += "requested model rejected by CLI/provider"
    }
    if (-not $ActualModels -or $ActualModels.Count -eq 0) {
        $reasons += "actual models could not be determined"
        return $reasons
    }

    $required = @($ToolPolicy.requiredModels)
    foreach ($m in $required) {
        $matched = $false
        foreach ($actual in $ActualModels) {
            if (([string]$actual -eq [string]$m) -or ([string]$actual).StartsWith(([string]$m + "-"), [System.StringComparison]::OrdinalIgnoreCase)) {
                $matched = $true
                break
            }
        }
        if (-not $matched) { $reasons += "required model missing: $m" }
    }

    if (-not [bool]$ToolPolicy.allowAdditionalModels) {
        $expectedModels = @($ToolPolicy.expectedModels | ForEach-Object { [string]$_ })
        foreach ($m in $ActualModels) {
            $matched = $false
            foreach ($expected in $expectedModels) {
                if (([string]$m -eq $expected) -or ([string]$m).StartsWith($expected + "-", [System.StringComparison]::OrdinalIgnoreCase)) {
                    $matched = $true
                    break
                }
            }
            if (-not $matched) { $reasons += "unexpected model used: $m" }
        }
    }

    if ($RequireRouting -and $ActualModels.Count -lt 2) {
        $reasons += "routing required but only one model appeared"
    }
    return @($reasons | Sort-Object -Unique)
}

function Write-MarkdownSummary {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)]$Records
    )
    $lines = @(
        "# Automated Benchmark Run",
        "",
        "- Benchmark: $Benchmark",
        "- RunId: $RunId",
        "- Generated: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')",
        ""
    )
    foreach ($record in $Records) {
        $lines += "## $($record.tool)"
        $lines += ""
        $lines += "- Valid: $($record.valid)"
        $lines += "- ExitCode: $($record.exitCode)"
        $lines += "- TimedOut: $($record.timedOut)"
        $lines += "- RequestedModel: $($record.requestedModel)"
        $lines += "- ActualModels: $($record.actualModels -join ', ')"
        $lines += "- CostUSD: $($record.metrics.totalCost)"
        $lines += "- TotalTokens: $($record.metrics.totalTokens)"
        $lines += "- MissingOutputs: $($record.missingOutputs -join ', ')"
        $lines += "- InvalidationReasons: $($record.invalidationReasons -join '; ')"
        $lines += ""
    }
    Set-Content -Path $Path -Encoding utf8 -Value $lines
}

$toolNames = @($policy.tools.PSObject.Properties.Name | Where-Object { $policy.tools.$_.enabled })
if ($Tools -and $Tools.Count -gt 0) {
    $unknownTools = @($Tools | Where-Object { $toolNames -notcontains $_ })
    if ($unknownTools.Count -gt 0) { throw "Unknown tool(s) for ${Benchmark}: $($unknownTools -join ', ')" }
    $toolNames = @($toolNames | Where-Object { $Tools -contains $_ })
}

Write-Host ""
Write-Host "Automated benchmark" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host "  Benchmark: $Benchmark"
Write-Host "  RunId:     $RunId"
Write-Host "  Tools:     $($toolNames -join ', ')"
Write-Host ""

$runScratchRoot = Join-Path $repoRoot "benchmarks\runs\$RunId\$Benchmark"
$runResultsRoot = Join-Path $benchmarkDir "results\runs\$RunId"
New-Item -ItemType Directory -Force -Path $runScratchRoot | Out-Null
New-Item -ItemType Directory -Force -Path $runResultsRoot | Out-Null

$runRecords = @()

foreach ($tool in $toolNames) {
    $toolPolicy = $policy.tools.$tool
    $toolConfig = $toolConfigs[$tool]
    if (-not $toolConfig) { throw "No adapter configured for tool: $tool" }

    $scratchDir = Join-Path $runScratchRoot $tool
    $workspaceDir = Join-Path $scratchDir "workspace"
    $resultToolDir = Join-Path $runResultsRoot $tool
    $resultOutputDir = Join-Path $resultToolDir "output"
    New-Item -ItemType Directory -Force -Path $workspaceDir | Out-Null
    New-Item -ItemType Directory -Force -Path $resultToolDir | Out-Null

    $stdoutPath = Join-Path $scratchDir "stdout.log"
    $stderrPath = Join-Path $scratchDir "stderr.log"
    $beforeJsonPath = Join-Path $scratchDir "_ccusage-before.json"
    $beforeTxtPath = Join-Path $scratchDir "_ccusage-before.txt"
    $afterJsonPath = Join-Path $scratchDir "_ccusage-after.json"
    $afterTxtPath = Join-Path $scratchDir "_ccusage-after.txt"
    $promptCopyPath = Join-Path $scratchDir "PROMPT.md"
    $requestedModel = [string]$toolPolicy.requestedModel
    $timeoutSeconds = [int]$policy.timeoutSeconds

    Set-Content -Path $promptCopyPath -Value $promptText -Encoding utf8

    Write-Host "Running $tool..." -ForegroundColor Cyan
    Invoke-CcusageSnapshot -Tool $tool -JsonPath $beforeJsonPath -TextPath $beforeTxtPath

    if ($DryRun) {
        Write-Host "  [dry-run] skipping CLI execution" -ForegroundColor Yellow
        $process = @{ exitCode = 0; timedOut = $false }
    } else {
        $invokeScriptPath = Join-Path $scratchDir "invoke-$tool.ps1"
        New-InvocationScript `
            -Tool $tool `
            -RequestedModel $requestedModel `
            -PromptPath $promptCopyPath `
            -WorkspaceDir $workspaceDir `
            -ScriptPath $invokeScriptPath
        $process = Invoke-LoggedProcess `
            -FilePath "pwsh" `
            -Arguments @("-File", $invokeScriptPath) `
            -WorkingDirectory $workspaceDir `
            -TimeoutSeconds $timeoutSeconds `
            -StdoutPath $stdoutPath `
            -StderrPath $stderrPath
    }

    Start-Sleep -Seconds 2
    Invoke-CcusageSnapshot -Tool $tool -JsonPath $afterJsonPath -TextPath $afterTxtPath

    $beforeJson = Get-Content $beforeJsonPath -Raw -Encoding utf8 | ConvertFrom-Json
    $afterJson = Get-Content $afterJsonPath -Raw -Encoding utf8 | ConvertFrom-Json
    $delta = Get-SessionsDelta -BeforeJson $beforeJson -AfterJson $afterJson
    $outputs = Test-ExpectedOutputs -WorkspaceDir $workspaceDir -ExpectedOutputs $policy.expectedOutputs
    Copy-WorkspaceOutputs -WorkspaceDir $workspaceDir -OutputDir $resultOutputDir

    $actualModels = @($delta.summary.actualModels)
    if ($actualModels.Count -eq 0) {
        $actualModels = @(Get-LogModelsFallback -LogPath $stdoutPath)
    }
    if ($actualModels.Count -eq 0) {
        $actualModels = @(Get-LogModelsFallback -LogPath $stderrPath)
    }

    $combinedLogText = ""
    if (Test-Path $stdoutPath) { $combinedLogText += (Get-Content $stdoutPath -Raw -Encoding utf8) }
    if (Test-Path $stderrPath) { $combinedLogText += "`n" + (Get-Content $stderrPath -Raw -Encoding utf8) }

    $invalidationReasons = @()
    if ($process.exitCode -ne 0 -and -not $outputs.valid) {
        $invalidationReasons += "non-zero exit with missing required outputs"
    }
    if (-not $outputs.valid) {
        foreach ($missing in $outputs.missing) { $invalidationReasons += "missing output category: $missing" }
    }
    $invalidationReasons += Test-PolicyCompliance `
        -ToolPolicy $toolPolicy `
        -ActualModels $actualModels `
        -RequireRouting ([bool]$toolPolicy.requireRouting) `
        -RequestedModel $requestedModel `
        -CombinedLogText $combinedLogText

    $record = [ordered]@{
        tool = $tool
        benchmark = $Benchmark
        runId = $RunId
        requestedModel = $requestedModel
        actualModels = @($actualModels)
        exitCode = $process.exitCode
        timedOut = $process.timedOut
        valid = ($invalidationReasons.Count -eq 0)
        invalidationReasons = @($invalidationReasons | Sort-Object -Unique)
        outputs = $outputs.found
        missingOutputs = @($outputs.missing)
        metrics = $delta.summary.totals
        sessionCount = $delta.summary.sessionCount
        sessionIds = $delta.summary.sessionIds
        scratchDir = $scratchDir
        resultDir = $resultToolDir
        stdoutPath = $stdoutPath
        stderrPath = $stderrPath
    }

    $recordPath = Join-Path $resultToolDir "_run-result.json"
    $record | ConvertTo-Json -Depth 12 | Set-Content -Path $recordPath -Encoding utf8
    Copy-Item -Path $stdoutPath, $stderrPath, $beforeJsonPath, $beforeTxtPath, $afterJsonPath, $afterTxtPath, $promptCopyPath -Destination $resultToolDir -Force -ErrorAction SilentlyContinue
    $runRecords += $record

    if ($record.valid) {
        Write-Host "  valid" -ForegroundColor Green
    } else {
        Write-Host "  invalid: $($record.invalidationReasons -join '; ')" -ForegroundColor Yellow
    }
}

$runRecords | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $runResultsRoot "_run-results.json") -Encoding utf8
Write-MarkdownSummary -Path (Join-Path $runResultsRoot "$RunId-auto.md") -Records $runRecords

if (-not $SkipJudge -and -not $DryRun) {
    $judgeEligible = @($runRecords | Where-Object { Test-Path (Join-Path $_.resultDir "output") })
    if ($judgeEligible.Count -gt 0) {
        Write-Host ""
        Write-Host "Running deterministic judge..." -ForegroundColor Cyan
        & $judgeScript -RunId $RunId -Benchmark $Benchmark
        if ($LASTEXITCODE -ne 0) { throw "judge-run.ps1 failed with exit code $LASTEXITCODE" }
    }
}

Write-Host ""
Write-Host "Run complete: $runResultsRoot" -ForegroundColor Green
