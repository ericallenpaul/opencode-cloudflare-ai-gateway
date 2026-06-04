<#
.SYNOPSIS
  Run a coding-agent benchmark and capture before/after usage deltas.

.DESCRIPTION
  Two-phase workflow for measuring a benchmark cleanly across multiple
  coding-agent tools, with a single RunId that ties their sessions together.

  Phase 1 (start): one invocation captures ccusage baselines for every tool
  in the $Tools config (top of this file), creates a scratch directory for
  each one under benchmarks/runs/<RunId>/<tool>/, and prints clearly labeled
  per-tool instructions for the user to follow.

  Phase 2 (finish): run once per tool after that tool's agent session has
  completed. Snapshots ccusage again for that tool, finds new sessions,
  computes totals (tokens/cost/wall-clock/models), writes JSON + summary,
  copies agent output into results/runs/<RunId>/<tool>/, stubs notes.md.
  For OpenCode, finish queries Cloudflare AI Gateway analytics and uses the
  gateway cost when the benchmark metadata tag is available.

.PARAMETER Phase
  Either "start" or "finish".

.PARAMETER Tool
  Required for finish only. One of the names in the $Tools config block
  below. If omitted on finish, it is inferred from the RunDir's leaf name.

.PARAMETER RunDir
  Required for finish. Absolute path to the scratch directory that start
  created for this tool. Start prints the exact finish command including
  this argument.

.PARAMETER RunId
  Logical id that groups every tool's session in one benchmark run.
  Start auto-generates as yyyy-MM-dd-HHmm if not provided.

.PARAMETER BaseDir
  Where scratch run directories live. Defaults to <repo>/benchmarks/runs
  (which is gitignored). Pass an explicit path to put them elsewhere.

.PARAMETER Benchmark
  Benchmark folder name under benchmarks/. Default: tic-tac-toe.

.PARAMETER NoCopy
  Skip the automatic copy-into-results step at the end of finish.

.EXAMPLE
  .\bench-run.ps1 -Phase start
  # ... follow the printed per-tool instructions ...
  .\bench-run.ps1 -Phase finish -RunDir <path-from-start-output>

.NOTES
  Adding a new coding-agent tool: edit the $Tools list at the top of this
  script. Add an entry with Name and Launch. The start phase will pick it up
  on the next invocation; no other changes required.

  Requirements: ccusage must be reachable. The script invokes it via
  `npx -y ccusage@latest`, so Node.js / npm must be installed. OpenCode
  gateway cost capture also requires CF_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_ID,
  CF_GATEWAY_NAME, and CLOUDFLARE_API_KEY. See benchmarks/README.md for the
  full prerequisite list.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet("start", "finish")]
    [string]$Phase,

    [string]$Tool,

    [string]$RunDir,

    [string]$RunId,

    [string]$BaseDir,

    [string]$Benchmark = "tic-tac-toe",

    # Optional comma-separated list of tool names to include. If omitted in the
    # start phase, prompts interactively. Validated against the $Tools config.
    # Example: -IncludeTools claude,opencode
    [string[]]$IncludeTools,

    [switch]$NoCopy,

    # By default, finish reuses the existing _ccusage-after.json sidecar if
    # present (so re-finishing to regenerate markdown is stable across days,
    # and unrelated tool use between runs doesn't contaminate the diff).
    # Pass -ForceRecapture to take a fresh post-run snapshot.
    [switch]$ForceRecapture
)

# ============================================================
# TOOL CONFIGURATION -- edit this list to add/remove agents.
# Name   = identifier used in dir names and as the -Tool value
# Launch = shell command typed at the prompt to start the tool
# ============================================================
$Tools = @(
    [PSCustomObject]@{ Name = "claude";   Launch = "claude" }
    [PSCustomObject]@{ Name = "codex";    Launch = "codex" }
    [PSCustomObject]@{ Name = "opencode"; Launch = "opencode --model openai-via-gateway/gpt-5" }
)

$ErrorActionPreference = "Stop"

# Repo root (script lives at <repo>/benchmarks/scripts/bench-run.ps1)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# Default BaseDir lives inside the repo (gitignored) so all benchmark
# artifacts stay in one place per checkout.
if (-not $BaseDir) {
    $BaseDir = Join-Path $repoRoot "benchmarks\runs"
}

$validToolNames = @($Tools | ForEach-Object Name)

# ---------- Helpers ------------------------------------------------------

function Invoke-Ccusage {
    param(
        [Parameter(Mandatory)][string]$Tool,
        [switch]$Json
    )
    $params = @($Tool, "session")
    if ($Json) { $params += "--json" }
    & npx -y "ccusage@latest" @params
    if ($LASTEXITCODE -ne 0) {
        throw "ccusage exited with code $LASTEXITCODE (args: $($params -join ' '))"
    }
}

function Get-NowIso {
    Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"
}

function Test-ToolReachable {
    param(
        [Parameter(Mandatory)][string]$ToolName,
        [Parameter(Mandatory)][string]$VersionCommand
    )
    try {
        $cmd = Get-Command $ToolName -ErrorAction Stop
    } catch {
        return @{ Ok = $false; Detail = "$ToolName not found on PATH" }
    }
    try {
        $out = & cmd /c "$VersionCommand 2>&1" | Out-String
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            return @{ Ok = $false; Detail = "$ToolName --version exited $exit -- $($out.Trim())" }
        }
        return @{ Ok = $true; Detail = ($out.Trim() -split "`n")[0] }
    } catch {
        return @{ Ok = $false; Detail = "$ToolName invocation error: $_" }
    }
}

function Test-LiveConfigSync {
    param(
        [Parameter(Mandatory)][string]$RepoRoot
    )
    # Compare the live opencode config's build-agent prompt against the repo
    # template. Returns @{ Match=$bool; LivePath=<str>; LiveLen=<int>; ExampleLen=<int>; Reason=<str> }.
    $livePath = Join-Path $env:USERPROFILE ".config\opencode\opencode.json"
    $examplePath = Join-Path $RepoRoot "opencode.example.json"
    if (-not (Test-Path $livePath)) {
        return @{ Match = $true; LivePath = $livePath; Reason = "no live config (skip check)" }
    }
    if (-not (Test-Path $examplePath)) {
        return @{ Match = $true; LivePath = $livePath; Reason = "no example to compare against (skip check)" }
    }
    try {
        $live = Get-Content $livePath -Raw -Encoding utf8 | ConvertFrom-Json
        $ex   = Get-Content $examplePath -Raw -Encoding utf8 | ConvertFrom-Json
        $livePrompt = [string]$live.agent.build.prompt
        $exPrompt   = [string]$ex.agent.build.prompt
        $match = ($livePrompt -eq $exPrompt)
        return @{
            Match      = $match
            LivePath   = $livePath
            LiveLen    = $livePrompt.Length
            ExampleLen = $exPrompt.Length
            Reason     = if ($match) { "live agent.build.prompt matches example" } else { "live agent.build.prompt differs from example ($($livePrompt.Length) vs $($exPrompt.Length) chars)" }
        }
    } catch {
        return @{ Match = $true; LivePath = $livePath; Reason = "config parse error -- skipping check: $_" }
    }
}

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
            $ans = Read-Host "  Include ${n}? [Y/n]"
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

# ccusage JSON shape varies by tool/version -- look up by candidate keys
function Get-Field {
    param(
        [Parameter(Mandatory)]$Obj,
        [Parameter(Mandatory)][string[]]$Keys,
        $Default = $null
    )
    foreach ($k in $Keys) {
        $v = $Obj.PSObject.Properties[$k]
        if ($null -ne $v -and $null -ne $v.Value) { return $v.Value }
    }
    return $Default
}

function Get-Sessions {
    param([Parameter(Mandatory)]$Obj)
    if ($Obj -is [System.Array]) { return $Obj }
    foreach ($key in @("sessions", "data", "entries", "items")) {
        if ($Obj.PSObject.Properties[$key]) { return $Obj.$key }
    }
    if (Get-Field $Obj @("sessionId", "session_id", "id")) { return @($Obj) }
    return @()
}

function Get-SessionId {
    param([Parameter(Mandatory)]$Session)
    $id = Get-Field $Session @("sessionId", "session_id", "id", "uuid")
    if ($id) { return [string]$id }
    $json = $Session | ConvertTo-Json -Compress -Depth 10
    return ([Security.Cryptography.SHA256]::Create().ComputeHash(
            [Text.Encoding]::UTF8.GetBytes($json)) | ForEach-Object { $_.ToString("x2") }) -join ""
}

# ---------- Phase: start -------------------------------------------------

if ($Phase -eq "start") {
    if (-not $RunId) {
        $RunId = Get-Date -Format "yyyy-MM-dd-HHmm"
    }

    $promptPath = Join-Path $repoRoot "benchmarks\$Benchmark\PROMPT.md"

    Write-Host ""
    Write-Host "Starting benchmark run" -ForegroundColor Cyan
    Write-Host "  RunId:     $RunId"
    Write-Host "  BaseDir:   $BaseDir"
    Write-Host "  Tools:     $($validToolNames -join ', ')"
    Write-Host ""

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

    Write-Host "Preflight: verifying each tool CLI is reachable..." -ForegroundColor DarkGray
    $preflightFailures = @()
    foreach ($t in $runtimeTools) {
        $check = Test-ToolReachable -ToolName $t.Name -VersionCommand "$($t.Name) --version"
        if ($check.Ok) {
            Write-Host "  $($t.Name): OK ($($check.Detail))" -ForegroundColor DarkGray
        } else {
            Write-Host "  $($t.Name): FAIL -- $($check.Detail)" -ForegroundColor Yellow
            $preflightFailures += $t.Name
        }
    }
    if ($preflightFailures.Count -gt 0) {
        Write-Host ""
        Write-Host "WARNING: preflight failed for: $($preflightFailures -join ', ')" -ForegroundColor Yellow
        Write-Host "  Common causes: (1) CLI not installed; (2) CLI not on PATH; (3) for codex specifically, expired subscription or exhausted API tokens." -ForegroundColor DarkGray
        Write-Host "  If you continue, those tools will produce empty output dirs and the judge will mark all criteria SKIP." -ForegroundColor DarkGray
        $resp = Read-Host "Continue with the rest? [y/N]"
        if ($resp -notmatch '^[Yy]') {
            Write-Host "Aborting start phase." -ForegroundColor Red
            exit 1
        }
    }

    # v7: warn loudly if the live opencode build-agent prompt has drifted from
    # the repo template. Prevents the class of bug that invalidated runs 1-4
    # (template edited, live config never re-copied -- benchmark measured the
    # wrong configuration). See docs/LEARNINGS.md "Validate live config..."
    $configSync = Test-LiveConfigSync -RepoRoot $repoRoot
    if (-not $configSync.Match) {
        Write-Host ""
        Write-Host "WARNING: live opencode build-agent prompt DIFFERS from the repo template." -ForegroundColor Yellow
        Write-Host "  Live    : $($configSync.LivePath) -- $($configSync.LiveLen) chars" -ForegroundColor DarkGray
        Write-Host "  Example : opencode.example.json  -- $($configSync.ExampleLen) chars" -ForegroundColor DarkGray
        Write-Host "  This means opencode will run with prompt instructions that DO NOT match" -ForegroundColor Yellow
        Write-Host "  what is currently in the repo. If you intended to iterate the build prompt" -ForegroundColor Yellow
        Write-Host "  and measure the result, you probably want to re-copy opencode.example.json" -ForegroundColor Yellow
        Write-Host "  into the live location before continuing. If you have intentional local" -ForegroundColor Yellow
        Write-Host "  customizations and want to proceed anyway, answer Y." -ForegroundColor Yellow
        $resp = Read-Host "Continue with live config as-is? [y/N]"
        if ($resp -notmatch '^[Yy]') {
            Write-Host "Aborting start phase. Re-copy opencode.example.json to ~/.config/opencode/opencode.json" -ForegroundColor Red
            Write-Host "(preserving any local customizations you want to keep), then re-run." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Live config sync: OK ($($configSync.Reason))" -ForegroundColor DarkGray
    }
    Write-Host ""

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
    Write-Host ""

    foreach ($t in $runtimeTools) {
        $name   = $t.Name
        $runDir = Join-Path $BaseDir "$RunId\$name"
        New-Item -ItemType Directory -Force -Path $runDir | Out-Null

        Write-Host "Capturing ccusage baseline for $name ..." -ForegroundColor DarkGray
        Invoke-Ccusage -Tool $name -Json | Set-Content -Encoding utf8 (Join-Path $runDir "_ccusage-before.json")
        Invoke-Ccusage -Tool $name       | Set-Content -Encoding utf8 (Join-Path $runDir "_ccusage-before.txt")
        Get-NowIso                       | Set-Content -Encoding utf8 (Join-Path $runDir "_start-time.txt")
        Set-Content -Encoding utf8 -Path (Join-Path $runDir "_run-id.txt") -Value $RunId
    }

    Write-Host ""
    Write-Host "Baselines captured. Per-tool instructions:" -ForegroundColor Green
    Write-Host ""

    foreach ($t in $runtimeTools) {
        $name      = $t.Name
        $launch    = $t.Launch
        $runDir    = Join-Path $BaseDir "$RunId\$name"
        $header    = $name.ToUpper()
        $underline = "=" * $header.Length
        if ($name -eq "opencode") {
            $appTag = "bench:${Benchmark}:${RunId}"
            $launch = "`$env:OPENCODE_APP_TAG = `"$appTag`"; $launch"
        }

        Write-Host $header     -ForegroundColor Cyan
        Write-Host $underline  -ForegroundColor Cyan
        Write-Host "  1. cd `"$runDir`""
        Write-Host "  2. $launch"
        Write-Host "  3. Paste the prompt from $promptPath"
        Write-Host "  4. Let the agent run to completion"
        Write-Host ""
    }

    Write-Host "AFTER ALL TOOLS FINISH" -ForegroundColor Green
    Write-Host "======================" -ForegroundColor Green
    Write-Host "  Run finish ONCE with the RunId -- it processes all configured tools:" -ForegroundColor Green
    Write-Host ""
    Write-Host "    & `"$PSCommandPath`" -Phase finish -RunId $RunId" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  (The '&' is the PowerShell call operator -- required to invoke a quoted script path.)" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

# ---------- Phase: finish ------------------------------------------------
#
# Finish-OneTool: per-tool processing block, called in a loop over $Tools.
# Returns a row hashtable, or $null if skipped/failed.

function Finish-OneTool {
    param(
        [Parameter(Mandatory)][string]$Tool,
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$Benchmark,
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][bool]$NoCopy
    )

    # v5: honor _run-config.json -- refuse to finish a skipped tool, and copy the
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
            $reason = $runConfig.skipped.$Tool
            throw "Tool '$Tool' was marked SKIPPED in _run-config.json (reason: $reason). Finish refuses to proceed."
        }
        # Copy run config into results dir for durable storage
        $resultsRunIdDir = Join-Path $RepoRoot "benchmarks\$Benchmark\results\runs\$RunId"
        New-Item -ItemType Directory -Force -Path $resultsRunIdDir | Out-Null
        $resultsConfigPath = Join-Path $resultsRunIdDir "_run-config.json"
        Copy-Item -Force $runConfigPath $resultsConfigPath
    }
    # If no _run-config.json exists, this is a pre-v5 run -- legacy behavior (all tools assumed selected).

    $beforeFile = Join-Path $RunDir "_ccusage-before.json"
    if (-not (Test-Path $beforeFile)) {
        Write-Host "  [skip] baseline snapshot missing for $Tool at $RunDir" -ForegroundColor Yellow
        return $null
    }

    Write-Host ""
    Write-Host "Processing: $Tool" -ForegroundColor Cyan
    Write-Host "  RunDir:  $RunDir" -ForegroundColor DarkGray

    $afterJsonPath = Join-Path $RunDir "_ccusage-after.json"
    $afterTxtPath  = Join-Path $RunDir "_ccusage-after.txt"
    $afterExists   = (Test-Path $afterJsonPath)

    if ($afterExists -and -not $ForceRecapture) {
        Write-Host "  Reusing existing _ccusage-after.json (pass -ForceRecapture to refresh)." -ForegroundColor DarkGray
    } else {
        if ($afterExists) {
            Write-Host "  -ForceRecapture: overwriting existing _ccusage-after.json" -ForegroundColor Yellow
        } else {
            Write-Host "  Capturing post-run ccusage state..." -ForegroundColor DarkGray
        }
        Invoke-Ccusage -Tool $Tool -Json | Set-Content -Encoding utf8 $afterJsonPath
        Invoke-Ccusage -Tool $Tool       | Set-Content -Encoding utf8 $afterTxtPath
    }

    # Diff before vs after -- needed before we can derive end time from ccusage
    $beforeJson = Get-Content $beforeFile -Raw -Encoding utf8 | ConvertFrom-Json
    $afterJson  = Get-Content (Join-Path $RunDir "_ccusage-after.json") -Raw -Encoding utf8 | ConvertFrom-Json

    $beforeSessions = Get-Sessions $beforeJson
    $afterSessions  = Get-Sessions $afterJson

    $beforeIds = [System.Collections.Generic.HashSet[string]]::new()
    foreach ($s in $beforeSessions) { $null = $beforeIds.Add((Get-SessionId $s)) }

    $newSessionsRaw = @($afterSessions | Where-Object { -not $beforeIds.Contains((Get-SessionId $_)) })

    # ---- Filter out sessions outside the benchmark window -------------
    # When -Phase finish is re-run later (or simply called long after the
    # benchmark ended), unrelated tool use between the baseline snapshot
    # and the post-run snapshot also shows up in the diff. Use the agent's
    # newest file mtime in the scratch dir as a proxy for benchmark end,
    # then add a 5-min buffer.
    $benchStartIso = (Get-Content (Join-Path $RunDir "_start-time.txt") -Raw -Encoding utf8).Trim()
    $benchStartDto = [DateTimeOffset]::Parse($benchStartIso)

    $agentFilesForWindow = Get-ChildItem -Path $RunDir -Force -ErrorAction SilentlyContinue |
        Where-Object { -not $_.Name.StartsWith("_") }
    $allAgentFilesForWindow = @()
    foreach ($f in $agentFilesForWindow) {
        if ($f.PSIsContainer) {
            $allAgentFilesForWindow += Get-ChildItem -Path $f.FullName -Recurse -File -ErrorAction SilentlyContinue
        } else {
            $allAgentFilesForWindow += $f
        }
    }
    if ($allAgentFilesForWindow.Count -gt 0) {
        $newestForWindow = $allAgentFilesForWindow | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $windowEndDto = ([DateTimeOffset]$newestForWindow.LastWriteTime).AddMinutes(5)
    } else {
        # No agent files (rare). Fall back to a 30-min cap from start.
        $windowEndDto = $benchStartDto.AddMinutes(30)
    }

    function Get-SessionStartTimestamp {
        param([Parameter(Mandatory)]$Session)
        # codex sessionId pattern: "2026/05/21/rollout-2026-05-21T08-20-22-<uuid>"
        $sid = [string](Get-Field $Session @("sessionId", "session_id", "id", "sessionFile"))
        if ($sid -match 'rollout-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})') {
            try { return [DateTimeOffset]::Parse("$($Matches[1])T$($Matches[2]):$($Matches[3]):$($Matches[4])") } catch { }
        }
        # opencode sessionId pattern: "ses_<base32-with-embedded-millis>" -- no usable ts
        # claude has no per-session start timestamp; lastActivity is just a date
        # Fall back to lastActivity if it looks like a full ISO timestamp
        $la = [string](Get-Field $Session @("lastActivity", "last_activity"))
        if ($la -match '^\d{4}-\d{2}-\d{2}T') {
            try { return [DateTimeOffset]::Parse($la) } catch { }
        }
        return $null
    }

    $newSessions = @()
    $filteredOut = 0
    foreach ($s in $newSessionsRaw) {
        $sessTs = Get-SessionStartTimestamp $s
        if ($null -ne $sessTs -and ($sessTs -lt $benchStartDto -or $sessTs -gt $windowEndDto)) {
            $filteredOut++
            continue
        }
        $newSessions += $s
    }
    if ($filteredOut -gt 0) {
        Write-Host "  Filtered $filteredOut session(s) outside the benchmark window (between $($benchStartDto.ToString('HH:mm')) and $($windowEndDto.ToString('HH:mm')))." -ForegroundColor DarkGray
    }

    # ---- End-time detection --------------------------------------------
    # finish runs once for all tools, but each tool finished at a different
    # moment, so "now" would inflate wall-clock for whichever finished first.
    #
    # Priority order (most reliable first):
    #   1. Newest mtime of agent-written file in the scratch dir.
    #      File mtimes don't get re-bumped after the agent exits, so this is
    #      the most honest signal for benchmark runs.
    #   2. ccusage session timestamp (only if it passes a sanity window).
    #      Observed in practice: `lastUpdated` etc. can get re-bumped at
    #      ccusage indexing time, returning values WAY after the real end,
    #      or rolled to start-of-day for some tools. We only accept a
    #      ccusage timestamp if it's strictly between start and now.
    #   3. Now (warning emitted).
    $startIsoForCheck = (Get-Content (Join-Path $RunDir "_start-time.txt") -Raw -Encoding utf8).Trim()
    $startDtoForCheck = [DateTimeOffset]::Parse($startIsoForCheck)
    $nowDto           = [DateTimeOffset]::Now

    $endTime = $null
    $endTimeSource = $null

    # 1. Newest agent file mtime
    $agentFilesCandidates = Get-ChildItem -Path $RunDir -Force -ErrorAction SilentlyContinue |
        Where-Object { -not $_.Name.StartsWith("_") }
    if ($agentFilesCandidates -and $agentFilesCandidates.Count -gt 0) {
        # Walk into top-level subdirs too -- agent might have created docs/, src/, etc.
        $allAgentFiles = @()
        foreach ($f in $agentFilesCandidates) {
            if ($f.PSIsContainer) {
                $allAgentFiles += Get-ChildItem -Path $f.FullName -Recurse -File -ErrorAction SilentlyContinue
            } else {
                $allAgentFiles += $f
            }
        }
        $newestFile = $allAgentFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newestFile) {
            $candidate = [DateTimeOffset]$newestFile.LastWriteTime
            if ($candidate -gt $startDtoForCheck -and $candidate -le $nowDto.AddMinutes(1)) {
                $endTime = $candidate.ToString("yyyy-MM-ddTHH:mm:sszzz")
                $endTimeSource = "newest agent file mtime ($($newestFile.Name))"
            }
        }
    }

    # 2. ccusage timestamp -- only if it passes sanity window
    if (-not $endTime -and $newSessions -and $newSessions.Count -gt 0) {
        $sessionTimestamps = @()
        foreach ($s in $newSessions) {
            $ts = Get-Field $s @("lastUpdated", "endTime", "sessionEnd", "lastActivity", "mostRecentTimestamp", "updatedAt", "endedAt")
            if ($ts) {
                try {
                    $dto = [DateTimeOffset]::Parse([string]$ts)
                    if ($dto -gt $startDtoForCheck -and $dto -le $nowDto.AddMinutes(1)) {
                        $sessionTimestamps += $dto
                    }
                } catch { }
            }
        }
        if ($sessionTimestamps.Count -gt 0) {
            $latest = $sessionTimestamps | Sort-Object -Descending | Select-Object -First 1
            $endTime = $latest.ToString("yyyy-MM-ddTHH:mm:sszzz")
            $endTimeSource = "ccusage session timestamp"
        }
    }

    # 3. Fall back to now
    if (-not $endTime) {
        $endTime = Get-NowIso
        $endTimeSource = "current time (no plausible end-time signal)"
        Write-Host "  WARNING: end time falling back to NOW for $Tool -- wall-clock will overestimate" -ForegroundColor Yellow
    }

    Write-Host "  End time:  $endTime  (source: $endTimeSource)" -ForegroundColor DarkGray
    $endTime | Set-Content -Encoding utf8 (Join-Path $RunDir "_end-time.txt")
    $endTimeSource | Set-Content -Encoding utf8 (Join-Path $RunDir "_end-time-source.txt")

    # Compute totals
    $totals = [ordered]@{
        inputTokens          = 0   # uncached delta input only (small for Claude due to caching)
        outputTokens         = 0
        reasoningOutputTokens= 0   # codex-specific "thinking" tokens (reported separately)
        cacheReadTokens      = 0   # cached context re-read each turn -- the bulk of "input" for cached models
        cacheWriteTokens     = 0   # tokens written into cache the first time (full-price)
        effectiveInputTokens = 0   # = inputTokens + cacheReadTokens + cacheWriteTokens (the honest "what did the model see")
        costUsd              = 0.0 # API-retail-equivalent cost (NOT subscription cost)
    }
    $modelsUsed = @{}

    foreach ($s in $newSessions) {
        # Field name variations observed across ccusage's tool adapters:
        #   inputTokens         (claude/codex/opencode)
        #   cacheReadTokens     (claude/opencode)
        #   cachedInputTokens   (codex's name for the same thing)
        #   cacheCreationTokens (claude/opencode for cache-write)
        #   reasoningOutputTokens (codex only, gpt-5 reasoning tokens)
        #   totalCost (claude/opencode), costUSD (codex)
        $in     = [int64](Get-Field $s @("inputTokens", "input_tokens", "input") 0)
        $out    = [int64](Get-Field $s @("outputTokens", "output_tokens", "output") 0)
        $reason = [int64](Get-Field $s @("reasoningOutputTokens", "reasoning_output_tokens") 0)
        $cR     = [int64](Get-Field $s @("cacheReadTokens", "cachedInputTokens", "cache_read_tokens", "cached_input_tokens", "cacheRead") 0)
        $cW     = [int64](Get-Field $s @("cacheCreationTokens", "cacheWriteTokens", "cache_creation_tokens", "cache_write_tokens", "cacheWrite") 0)
        $cost   = [double](Get-Field $s @("cost", "costUsd", "costUSD", "cost_usd", "totalCost") 0.0)

        $totals.inputTokens           += $in
        $totals.outputTokens          += $out
        $totals.reasoningOutputTokens += $reason
        $totals.cacheReadTokens       += $cR
        $totals.cacheWriteTokens      += $cW
        $totals.effectiveInputTokens  += ($in + $cR + $cW)
        $totals.costUsd               += $cost

        # Model extraction handles three shapes:
        #   modelsUsed: [ "name1", "name2" ]   (claude/opencode)
        #   models: { "name1": {...}, ... }    (codex -- model name is the key)
        #   model / modelId fields directly on the session (some adapters)
        # PowerShell auto-unwraps single-element arrays returned from functions,
        # so handle both array AND scalar return shapes from Get-Field.
        $modelList = @()
        $modelsField = Get-Field $s @("modelsUsed", "models_used")
        if ($modelsField) {
            if ($modelsField -is [System.Collections.IEnumerable] -and -not ($modelsField -is [string])) {
                foreach ($m in $modelsField) { $modelList += [string]$m }
            } else {
                $modelList += [string]$modelsField
            }
        }
        $modelsObj = $s.PSObject.Properties['models']
        if ($modelsObj -and $modelsObj.Value -and $modelsObj.Value.PSObject.Properties) {
            $modelList += @($modelsObj.Value.PSObject.Properties.Name)
        }
        $directModel = Get-Field $s @("model", "modelId", "model_id", "modelName")
        if ($directModel) {
            $modelList += [string]$directModel
        }
        foreach ($m in $modelList) {
            $mKey = [string]$m
            if (-not $modelsUsed.ContainsKey($mKey)) { $modelsUsed[$mKey] = 0 }
            $modelsUsed[$mKey]++
        }
    }

    # Wall clock
    $startIso = (Get-Content (Join-Path $RunDir "_start-time.txt") -Raw -Encoding utf8).Trim()
    $endIso   = (Get-Content (Join-Path $RunDir "_end-time.txt")   -Raw -Encoding utf8).Trim()
    $startDt  = [DateTimeOffset]::Parse($startIso)
    $endDt    = [DateTimeOffset]::Parse($endIso)
    $wall     = $endDt - $startDt
    $wallHuman = "{0:D2}m {1:D2}s" -f [int]$wall.TotalMinutes, $wall.Seconds

    $costSource = "ccusage"
    $gatewayCostPath = Join-Path $RunDir "_gateway-cost.json"
    if ($Tool -eq "opencode") {
        . (Join-Path $PSScriptRoot "gateway-cost.ps1")
        $runTag = "bench:${Benchmark}:${RunId}"
        Write-Host "  querying gateway analytics for $runTag ..." -ForegroundColor Cyan
        $gwCost = Get-OpenCodeGatewayCost -RunTag $runTag -StartUtc $startDt.UtcDateTime
        $gwCost | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -Path $gatewayCostPath
        if ($gwCost.source -eq "gateway") {
            $totals.costUsd = [double]$gwCost.total.cost
            $costSource = "gateway"
            Write-Host "  opencode cost (gateway): $($gwCost.total.cost)" -ForegroundColor Green
        } else {
            $costSource = "ccusage (gateway-unavailable: $($gwCost.error))"
            Write-Host "  gateway unavailable, keeping ccusage cost: $($gwCost.error)" -ForegroundColor Yellow
        }
    }

    # Persist
    $delta = [PSCustomObject]@{
        tool             = $Tool
        runDir           = $RunDir
        startTime        = $startIso
        endTime          = $endIso
        wallClockSec     = [int]$wall.TotalSeconds
        wallClockHuman   = $wallHuman
        newSessionCount  = $newSessions.Count
        totals           = $totals
        costSource       = $costSource
        modelsUsed       = $modelsUsed
        newSessions      = $newSessions
    }

    $delta | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 (Join-Path $RunDir "_delta.json")

    # Human-readable summary
    $summaryLines = @()
    $summaryLines += "Benchmark delta: $Tool"
    $summaryLines += "======================"
    $summaryLines += "Run directory: $RunDir"
    $summaryLines += "Start time:    $startIso"
    $summaryLines += "End time:      $endIso"
    $summaryLines += "Wall clock:    $wallHuman ($([int]$wall.TotalSeconds) seconds)"
    $summaryLines += ""
    $summaryLines += "New sessions found: $($newSessions.Count)"
    if ($modelsUsed.Count -gt 0) {
        $summaryLines += "Models used:        $(($modelsUsed.Keys | Sort-Object) -join ', ')"
    } else {
        $summaryLines += "Models used:        (none detected -- ccusage JSON may not expose model field)"
    }
    $summaryLines += ""
    $summaryLines += "Totals across new sessions:"
    $summaryLines += ("  Input tokens:       {0:N0}" -f $totals.inputTokens)
    $summaryLines += ("  Output tokens:      {0:N0}" -f $totals.outputTokens)
    $summaryLines += ("  Cache read tokens:  {0:N0}" -f $totals.cacheReadTokens)
    $summaryLines += ("  Cache write tokens: {0:N0}" -f $totals.cacheWriteTokens)
    $summaryLines += ("  Total cost (USD):   `${0:F4}" -f $totals.costUsd)
    $summaryLines += "  Cost source:        $costSource"

    if ($modelsUsed.Count -gt 0) {
        $summaryLines += ""
        $summaryLines += "Per-model session count:"
        foreach ($k in ($modelsUsed.Keys | Sort-Object)) {
            $summaryLines += "  $k : $($modelsUsed[$k])"
        }
    }

    $summary = $summaryLines -join "`n"
    $summary | Set-Content -Encoding utf8 (Join-Path $RunDir "_delta-summary.txt")

    if ($newSessions.Count -eq 0) {
        Write-Host "  WARNING: no new sessions detected for $Tool." -ForegroundColor Yellow
        Write-Host "    - Agent may have exited mid-run, or ccusage hasn't indexed yet." -ForegroundColor Yellow
    } else {
        Write-Host "  Wall: $wallHuman | Cost: `$$($totals.costUsd.ToString('F4')) ($costSource) | In: $($totals.inputTokens.ToString('N0')) | Out: $($totals.outputTokens.ToString('N0')) | Sessions: $($newSessions.Count)" -ForegroundColor Green
    }

    # ---------- Copy outputs into the repo and stub notes.md ----------------

    $resultsDir = Join-Path $RepoRoot "benchmarks\$Benchmark\results\runs\$RunId\$Tool"
    $outputDir  = Join-Path $resultsDir "output"
    $notesPath  = Join-Path $resultsDir "notes.md"

    if ($NoCopy) {
        Write-Host "  -NoCopy: skipping copy into results dir." -ForegroundColor Yellow
    } else {
        if (-not (Test-Path $resultsDir)) {
            New-Item -ItemType Directory -Force -Path $resultsDir | Out-Null
        }
        New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

        # Idempotent re-finish: clean stale sidecar FILES that earlier versions of
        # this script used to copy into resultsDir but no longer do. Scope is
        # IMPORTANT -- do NOT use `_*` (would nuke _judge-functional.json,
        # _screenshots/, etc. that other scripts own).
        $staleBenchPatterns = @(
            "_ccusage-*.json", "_ccusage-*.txt",
            "_delta.json", "_delta-summary.txt", "_gateway-cost.json",
            "_start-time.txt", "_end-time.txt", "_end-time-source.txt",
            "_run-id.txt"
        )
        foreach ($pat in $staleBenchPatterns) {
            Get-ChildItem -Path $resultsDir -Filter $pat -File -ErrorAction SilentlyContinue |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }

        # Agent-generated files only (everything not starting with _)
        $agentFiles = Get-ChildItem -Path $RunDir -Force | Where-Object { -not $_.Name.StartsWith("_") }
        foreach ($f in $agentFiles) {
            Copy-Item -Recurse -Force -Path $f.FullName -Destination $outputDir
        }

        if (Test-Path $gatewayCostPath) {
            Copy-Item -Force -Path $gatewayCostPath -Destination $resultsDir
        }

        # Best-effort session-transcript copy
        $transcriptDest = Join-Path $resultsDir "_session-transcript"
        switch ($Tool) {
            "claude" {
                $encoded = ($RunDir -replace '[\\:]', '-').TrimStart('-')
                $src = Join-Path $env:USERPROFILE ".claude\projects\$encoded"
                if (Test-Path $src) {
                    New-Item -ItemType Directory -Force -Path $transcriptDest | Out-Null
                    Copy-Item -Recurse -Force -Path "$src\*" -Destination $transcriptDest
                }
            }
            "codex" {
                # NOTE: codex stores all sessions in one global directory and
                # ccusage indexing bumps mtimes on unrelated old sessions, so
                # the mtime filter is not reliable -- it has been observed to
                # pull in entirely unrelated work sessions that fell into the
                # window. Those transcripts can contain sensitive context.
                # For now we DO NOT auto-copy codex transcripts. If you need a
                # specific session captured, copy it manually after exiting
                # codex by inspecting ~/.codex/sessions/.
                # See docs/LEARNINGS.md for the full story.
                Write-Host "  Skipping codex transcript auto-copy (see docs/LEARNINGS.md)." -ForegroundColor DarkGray
                # Original copy logic preserved for reference, disabled:
                <#
                $codexSessions = Join-Path $env:USERPROFILE ".codex\sessions"
                if (Test-Path $codexSessions) {
                    $recent = Get-ChildItem $codexSessions -Recurse -File | Where-Object { $_.LastWriteTime -ge $startDt.DateTime }
                    if ($recent) {
                        New-Item -ItemType Directory -Force -Path $transcriptDest | Out-Null
                        $recent | Copy-Item -Destination $transcriptDest -Force
                    }
                }
                #>
            }
            "opencode" {
                # SQLite-backed; manual export via `opencode export <session-id>`
            }
        }

        # Stub notes.md if missing
        if (-not (Test-Path $notesPath)) {
            $modelsLine = if ($modelsUsed.Count -gt 0) { ($modelsUsed.Keys | Sort-Object) -join ", " } else { "(none detected)" }
            $notesStub = @"
# $Tool -- $Benchmark run $RunId

## Plugin stack
- (list active plugins / MCPs / skills sources)

## Model(s) used
- $modelsLine

## Acceptance criteria (score PASS / PARTIAL / FAIL per SPEC.md)
- R1:
- R2:
- R3:
- R4:
- R5:
- R6:
- R7:
- R8:
- R9:
- R10:

## Quality scores (1-5)
- Readability:
- Test breadth:
- UX polish:
- Defensiveness:
- Documentation:

## Metrics (from _delta-summary.txt)
- Input tokens (ccusage):  $($totals.inputTokens.ToString("N0"))
- Output tokens (ccusage): $($totals.outputTokens.ToString("N0"))
- Cache read tokens:       $($totals.cacheReadTokens.ToString("N0"))
- Cache write tokens:      $($totals.cacheWriteTokens.ToString("N0"))
- Cost:                    `$$($totals.costUsd.ToString("F4"))
- Cost source:             $costSource
- Wall-clock time:         $wallHuman ($([int]$wall.TotalSeconds) seconds)
- End-time source:         $endTimeSource
- New sessions detected:   $($newSessions.Count)

## Observations
- What the agent did well
- Where it got stuck or wasted tokens
- Tool/skill choices worth flagging (did it use lsp? grep? which superpowers skills?)
- Plugin/state observations (claude-mem influence? context-mode visible effect?)

## Reproducibility
- Run order this was in (first/second/third on the day):
- Anything irreproducible to flag (transient network issues, etc.):
"@
            $notesStub | Set-Content -Encoding utf8 -Path $notesPath
        }
    }

    # Detect deliverables
    $htmlFile = $null
    $testFile = $null
    if (Test-Path $outputDir) {
        $htmlFile = Get-ChildItem -Path $outputDir -Filter "*.html"    -ErrorAction SilentlyContinue | Select-Object -First 1
        $testFile = Get-ChildItem -Path $outputDir -Filter "*.test.js" -ErrorAction SilentlyContinue | Select-Object -First 1
    }

    return [PSCustomObject]@{
        Tool                 = $Tool
        Skipped              = $false
        StartTime            = $startIso
        EndTime              = $endTime
        EndTimeSource        = $endTimeSource
        WallSec              = [int]$wall.TotalSeconds
        WallHuman            = $wallHuman
        Cost                 = [double]$totals.costUsd
        CostSource           = $costSource
        InputTokens          = [int64]$totals.inputTokens
        EffectiveInputTokens = [int64]$totals.effectiveInputTokens
        OutputTokens         = [int64]$totals.outputTokens
        ReasoningOutputTokens= [int64]$totals.reasoningOutputTokens
        CacheReadTokens      = [int64]$totals.cacheReadTokens
        CacheWriteTokens     = [int64]$totals.cacheWriteTokens
        Sessions             = $newSessions.Count
        Models               = ($modelsUsed.Keys | Sort-Object) -join ", "
        ResultsDir           = $resultsDir
        OutputDir            = $outputDir
        NotesPath            = $notesPath
        HtmlFile             = if ($htmlFile) { $htmlFile.FullName } else { $null }
        TestFile             = if ($testFile) { $testFile.FullName } else { $null }
    }
}

# ---------- Main: finish phase --------------------------------------------

if (-not $RunId) {
    throw "Finish phase requires -RunId. Start phase printed it (yyyy-MM-dd-HHmm)."
}

# If -Tool was passed, restrict to that one tool; otherwise process all configured.
$toolsToProcess = if ($Tool) {
    if ($validToolNames -notcontains $Tool) {
        throw "Unknown -Tool '$Tool'. Configured: $($validToolNames -join ', ')"
    }
    $Tools | Where-Object { $_.Name -eq $Tool }
} else {
    $Tools
}

Write-Host ""
Write-Host "Finishing benchmark run $RunId" -ForegroundColor Cyan
Write-Host "  BaseDir: $BaseDir"
Write-Host "  Tools:   $((($toolsToProcess | ForEach-Object Name)) -join ', ')"
Write-Host ""

# Load skipped tool names from _run-config.json (written by start phase, v5+).
# Tools listed under "skipped" were intentionally excluded from this run; the
# loop skips them silently (no throw) so finish-all still completes cleanly.
$skippedNames = @()
$runConfigPath = Join-Path (Join-Path $BaseDir $RunId) "_run-config.json"
if (Test-Path $runConfigPath) {
    $rc = Get-Content $runConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($rc.skipped) {
        $skippedNames = @($rc.skipped.PSObject.Properties.Name)
    }
}

$rows = @()
foreach ($t in $toolsToProcess) {
    if ($skippedNames -contains $t.Name) {
        Write-Host "  [skip] $($t.Name) marked skipped in _run-config.json" -ForegroundColor DarkGray
        continue
    }
    $runDirForTool = Join-Path $BaseDir "$RunId\$($t.Name)"
    if (-not (Test-Path $runDirForTool)) {
        Write-Host "  [skip] no scratch dir for $($t.Name): $runDirForTool" -ForegroundColor Yellow
        continue
    }
    $row = Finish-OneTool -Tool $t.Name -RunDir $runDirForTool -RunId $RunId -Benchmark $Benchmark -RepoRoot $repoRoot -NoCopy:$NoCopy
    if ($row) { $rows += $row }
}

# Summary table across all processed tools
Write-Host ""
Write-Host "Run $RunId summary" -ForegroundColor Green
Write-Host ("=" * 80) -ForegroundColor Green
Write-Host ("{0,-10} {1,10} {2,12} {3,-18} {4,12} {5,12} {6,8}" -f "Tool", "Wall", "Cost(USD)", "CostSource", "InTokens", "OutTokens", "Sess")
Write-Host ("{0,-10} {1,10} {2,12} {3,-18} {4,12} {5,12} {6,8}" -f "----", "----", "---------", "----------", "--------", "---------", "----")
foreach ($r in $rows) {
    $costSourceCell = if ($r.CostSource) { $r.CostSource } else { "ccusage" }
    Write-Host ("{0,-10} {1,10} {2,12} {3,-18} {4,12} {5,12} {6,8}" -f `
        $r.Tool, `
        $r.WallHuman, `
        ('$' + $r.Cost.ToString("F4")), `
        $costSourceCell, `
        $r.InputTokens.ToString("N0"), `
        $r.OutputTokens.ToString("N0"), `
        $r.Sessions)
}
Write-Host ""

# Per-tool deliverables / next-step hints
foreach ($r in $rows) {
    Write-Host "$($r.Tool):" -ForegroundColor Cyan
    Write-Host "  Notes:   $($r.NotesPath)" -ForegroundColor DarkGray
    if ($r.HtmlFile) {
        Write-Host "  Open:    start `"$($r.HtmlFile)`"" -ForegroundColor DarkGray
    }
    if ($r.TestFile) {
        Write-Host "  Test:    cd `"$($r.OutputDir)`"; node --test `"$([System.IO.Path]::GetFileName($r.TestFile))`"" -ForegroundColor DarkGray
    }
    if (-not $r.HtmlFile -and -not $r.TestFile) {
        Write-Host "  (no .html / .test.js found in output -- inspect $($r.OutputDir))" -ForegroundColor Yellow
    }
}
Write-Host ""

# ---- Cross-tool comparison file ----------------------------------------
# The whole point of the benchmark: side-by-side token / cost / time for
# every tool in this RunId, in one machine-readable + one human-readable
# file at the RunId level.

if ($rows.Count -gt 0) {
    $runDirResults = Join-Path $repoRoot "benchmarks\$Benchmark\results\runs\$RunId"
    if (-not (Test-Path $runDirResults)) {
        New-Item -ItemType Directory -Force -Path $runDirResults | Out-Null
    }
    $comparisonMd   = Join-Path $runDirResults "$RunId.md"
    $comparisonJson = Join-Path $runDirResults "$RunId.json"

    $generatedAt = Get-NowIso

    $mdLines = @()
    $mdLines += "# Benchmark Run $RunId"
    $mdLines += ""
    $mdLines += "_Benchmark target: ``$Benchmark``  |  Generated: ${generatedAt}_"
    $mdLines += ""
    $mdLines += "## Headline (sorted by cost ascending)"
    $mdLines += ""
    $mdLines += "| Tool | Wall | Cost (USD) | Cost source | Effective Input | Output | Models |"
    $mdLines += "|---|---:|---:|---|---:|---:|---|"
    $sortedByCost = $rows | Sort-Object Cost
    foreach ($r in $sortedByCost) {
        $modelsCell = if ($r.Models) { $r.Models } else { "_(not in ccusage JSON)_" }
        $costSourceCell = if ($r.CostSource) { $r.CostSource } else { "ccusage" }
        $line = '| {0} | {1} | ${2:F4} | {3} | {4:N0} | {5:N0} | {6} |' -f `
            $r.Tool, $r.WallHuman, $r.Cost, $costSourceCell, $r.EffectiveInputTokens, $r.OutputTokens, $modelsCell
        $mdLines += $line
    }
    $mdLines += ""
    $mdLines += "**Effective Input** = ``inputTokens`` + ``cacheReadTokens`` + ``cacheWriteTokens``. This is the honest 'what did the model actually see' number. Tools with aggressive prompt caching (Claude Code in particular) report tiny ``inputTokens`` because most of the prompt is cache-served on each turn; without rolling those in, the comparison is misleading."
    $mdLines += ""
    $mdLines += "## Token breakdown"
    $mdLines += ""
    $mdLines += "| Tool | Input (uncached) | Cache Read | Cache Write | Output | Reasoning | Total Tokens |"
    $mdLines += "|---|---:|---:|---:|---:|---:|---:|"
    foreach ($r in $sortedByCost) {
        $total = $r.InputTokens + $r.CacheReadTokens + $r.CacheWriteTokens + $r.OutputTokens + $r.ReasoningOutputTokens
        $reasoningCell = if ($r.ReasoningOutputTokens -gt 0) { ('{0:N0}' -f $r.ReasoningOutputTokens) } else { '-' }
        $line = '| {0} | {1:N0} | {2:N0} | {3:N0} | {4:N0} | {5} | {6:N0} |' -f `
            $r.Tool, $r.InputTokens, $r.CacheReadTokens, $r.CacheWriteTokens, $r.OutputTokens, $reasoningCell, $total
        $mdLines += $line
    }
    $mdLines += ""
    $mdLines += "## Timing"
    $mdLines += ""
    $mdLines += "| Tool | Start | End | End-time source |"
    $mdLines += "|---|---|---|---|"
    foreach ($r in $rows) {
        $mdLines += "| $($r.Tool) | $($r.StartTime) | $($r.EndTime) | $($r.EndTimeSource) |"
    }
    $mdLines += ""
    $mdLines += "## Deliverables"
    $mdLines += ""
    $mdLines += "| Tool | Output | Notes |"
    $mdLines += "|---|---|---|"
    foreach ($r in $rows) {
        $mdLines += "| $($r.Tool) | [output/]($($r.Tool)/output/) | [notes.md]($($r.Tool)/notes.md) |"
    }
    $mdLines += ""
    $mdLines += "## Notes on the metrics"
    $mdLines += ""
    $mdLines += "- **Cost source.** For OpenCode, this script uses Cloudflare AI Gateway analytics when the tagged gateway rows are available and writes ``_gateway-cost.json``. For all other tools, and for OpenCode when the gateway query is unavailable, cost remains the ``ccusage`` API-retail-equivalent fallback."
    $mdLines += "- **Cache fields vary by tool.** Claude uses ``cacheReadTokens`` / ``cacheCreationTokens``. Codex uses ``cachedInputTokens`` for the same concept and doesn't expose cache-writes at all. Opencode uses ``cacheReadTokens`` / ``cacheCreationTokens``. The script handles all three; if a future tool exposes different field names, add them to the alias lists in bench-run.ps1's Finish-OneTool."
    $mdLines += "- **Wall**: end - start, where end is detected per tool (see Timing table). When end-time source is ``current time``, wall-clock overestimates."
    $mdLines += "- **Sessions**: count of new ccusage sessions detected for that tool. Should be 1 in a normal benchmark."
    $mdLines += "- **Reasoning tokens** (codex, gpt-5) are the model's internal 'thinking' tokens, billed as output. Other tools don't currently expose this separately."
    $mdLines += ""
    $mdLines += "## See also"
    $mdLines += ""
    $mdLines += "- [``../../comparisons.md``](../../comparisons.md) -- ongoing ranking log across all runs"
    $mdLines += "- [``../../../METHODOLOGY.md``](../../../METHODOLOGY.md) -- how runs are structured"
    $mdLines += "- [``../../../SPEC.md``](../../../SPEC.md) -- acceptance criteria"
    $mdLines += "- Raw ccusage snapshots, gateway cost sidecars, and deltas (gitignored scratch): ``<repo>/benchmarks/runs/$RunId/``"

    ($mdLines -join "`n") | Set-Content -Encoding utf8 -Path $comparisonMd

    @{
        runId       = $RunId
        benchmark   = $Benchmark
        generatedAt = $generatedAt
        tools       = $rows
    } | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 -Path $comparisonJson

    Write-Host "Cross-tool comparison written:" -ForegroundColor Green
    Write-Host "  $comparisonMd" -ForegroundColor Yellow
    Write-Host "  $comparisonJson" -ForegroundColor Yellow
    Write-Host ""
}

# Ranking-log hint -- comparisons.md is hand-maintained (human judgement)
$comparisonsPath = Join-Path $repoRoot "benchmarks\$Benchmark\results\comparisons.md"
Write-Host "After scoring each notes.md, add a ranking line to:" -ForegroundColor Green
Write-Host "  $comparisonsPath" -ForegroundColor Yellow
Write-Host "  Example: - $RunId -- #1 codex, #2 opencode, #3 claude" -ForegroundColor DarkGray
Write-Host ""
