<#
.SYNOPSIS
  Diagnoses whether this machine is correctly set up to use opencode-cloudflare-ai-gateway.

.DESCRIPTION
  Runs 12 checks (9 required, 3 optional) and prints a per-check result line plus a
  summary. Pure diagnostic by default -- no side effects. Pass -InstallConfig to
  copy opencode.example.json into place when check 7 (opencode.json exists) fails.

.PARAMETER InstallConfig
  If opencode.json does not exist, copy the repo's opencode.example.json into
  ~/.config/opencode/opencode.json. The only side effect this script can produce.

.EXAMPLE
  .\check-setup.ps1

.EXAMPLE
  .\check-setup.ps1 -InstallConfig
#>
[CmdletBinding()]
param(
    [switch]$InstallConfig
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------

$UseColor = -not [Console]::IsOutputRedirected

function Write-Pass([string]$msg) {
    if ($UseColor) { Write-Host $msg -ForegroundColor Green }
    else           { Write-Host $msg }
}
function Write-Fail([string]$msg) {
    if ($UseColor) { Write-Host $msg -ForegroundColor Red }
    else           { Write-Host $msg }
}
function Write-Warn([string]$msg) {
    if ($UseColor) { Write-Host $msg -ForegroundColor Yellow }
    else           { Write-Host $msg }
}
function Write-Info([string]$msg) {
    Write-Host $msg
}

# ---------------------------------------------------------------------------
# Env var resolution (check User + Process scopes like verify-models does)
# ---------------------------------------------------------------------------

function Get-EnvVar([string]$name) {
    $val = [Environment]::GetEnvironmentVariable($name, "User")
    if (-not $val) { $val = [Environment]::GetEnvironmentVariable($name, "Process") }
    return $val
}

# ---------------------------------------------------------------------------
# Check result tracking
# ---------------------------------------------------------------------------

$results = [System.Collections.Generic.List[hashtable]]::new()

function Add-Result {
    param(
        [int]$Index,
        [string]$Label,
        [bool]$Passed,
        [bool]$Optional,
        [string]$Detail,
        [string[]]$FixLines
    )
    $results.Add(@{
        Index    = $Index
        Label    = $Label
        Passed   = $Passed
        Optional = $Optional
        Detail   = $Detail
        FixLines = $FixLines
    })
}

# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

$TOTAL_CHECKS = 12

function Format-CheckLine([int]$idx, [string]$label, [string]$status, [string]$detail) {
    $prefix = "[{0,2}/{1}]" -f $idx, $TOTAL_CHECKS
    # Pad label + dots so status column is ~55 chars from prefix
    $combined = "$label "
    $dotCount  = [Math]::Max(1, 52 - $combined.Length)
    $dots = "." * $dotCount
    $optTag = ""
    if ($status -match "optional") { $optTag = "  (optional)" }
    "$prefix $combined$dots $status$optTag"
}

# ---------------------------------------------------------------------------
# Path constants
# ---------------------------------------------------------------------------

$HOME_DIR    = $env:USERPROFILE
$CONFIG_DIR  = Join-Path $HOME_DIR ".config\opencode"
$CONFIG_FILE = Join-Path $CONFIG_DIR "opencode.json"
$REPO_ROOT   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EXAMPLE_CFG = Join-Path $REPO_ROOT "opencode.example.json"

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

Write-Info ""
Write-Info "opencode-cloudflare-ai-gateway :: check-setup"
Write-Info "Repo:   $REPO_ROOT"
Write-Info "Config: $CONFIG_FILE"
Write-Info ""

# ---------------------------------------------------------------------------
# Check 1 -- OpenCode CLI on PATH
# ---------------------------------------------------------------------------

$idx = 1
$label = "OpenCode CLI on PATH"
try {
    $ocOut = & opencode --version 2>&1
    $ocVer = ($ocOut | Out-String).Trim()
    $line = Format-CheckLine $idx $label "PASS ($ocVer)" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail $ocVer -FixLines @()
} catch {
    $line = Format-CheckLine $idx $label "FAIL" ""
    Write-Fail $line
    Write-Info "        Fix: install OpenCode -- see https://opencode.ai"
    Write-Info "        See docs/SETUP.md section 1."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "not found on PATH" -FixLines @(
        "Install OpenCode from https://opencode.ai and ensure it is on your PATH."
    )
}

# ---------------------------------------------------------------------------
# Check 2 -- Node.js >= 18
# ---------------------------------------------------------------------------

$idx = 2
$label = "Node.js >= 18"
try {
    $nodeOut = & node --version 2>&1
    $nodeVer = ($nodeOut | Out-String).Trim()
    # Parse major version number
    if ($nodeVer -match '^v?(\d+)') {
        $major = [int]$Matches[1]
        if ($major -ge 18) {
            $line = Format-CheckLine $idx $label "PASS ($nodeVer)" ""
            Write-Pass $line
            Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail $nodeVer -FixLines @()
        } else {
            $line = Format-CheckLine $idx $label "FAIL (found $nodeVer)" ""
            Write-Fail $line
            Write-Info "        Fix: upgrade Node.js to >= 18 -- https://nodejs.org"
            Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "found $nodeVer, need >= 18" -FixLines @(
                "Upgrade Node.js to >= 18: https://nodejs.org"
            )
        }
    } else {
        $line = Format-CheckLine $idx $label "FAIL (could not parse version: $nodeVer)" ""
        Write-Fail $line
        Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "could not parse version" -FixLines @(
            "Upgrade Node.js to >= 18: https://nodejs.org"
        )
    }
} catch {
    $line = Format-CheckLine $idx $label "FAIL (not found)" ""
    Write-Fail $line
    Write-Info "        Fix: install Node.js >= 18 -- https://nodejs.org"
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "not found on PATH" -FixLines @(
        "Install Node.js >= 18: https://nodejs.org"
    )
}

# ---------------------------------------------------------------------------
# Check 3 -- CF_ACCOUNT_ID
# ---------------------------------------------------------------------------

$idx = 3
$label = "CF_ACCOUNT_ID env var"
$val = Get-EnvVar "CF_ACCOUNT_ID"
if ($val) {
    $line = Format-CheckLine $idx $label "PASS ($($val.Length) chars)" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail "$($val.Length) chars" -FixLines @()
} else {
    $line = Format-CheckLine $idx $label "FAIL (unset)" ""
    Write-Fail $line
    Write-Info "        Fix: set CF_ACCOUNT_ID to your Cloudflare account ID."
    Write-Info "          [Environment]::SetEnvironmentVariable(`"CF_ACCOUNT_ID`", `"<value>`", `"User`")"
    Write-Info "        See docs/SETUP.md section 2."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "unset" -FixLines @(
        "[Environment]::SetEnvironmentVariable(`"CF_ACCOUNT_ID`", `"<value>`", `"User`")"
    )
}

# ---------------------------------------------------------------------------
# Check 4 -- CF_GATEWAY_NAME
# ---------------------------------------------------------------------------

$idx = 4
$label = "CF_GATEWAY_NAME env var"
$val = Get-EnvVar "CF_GATEWAY_NAME"
if ($val) {
    $line = Format-CheckLine $idx $label "PASS ($($val.Length) chars)" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail "$($val.Length) chars" -FixLines @()
} else {
    $line = Format-CheckLine $idx $label "FAIL (unset)" ""
    Write-Fail $line
    Write-Info "        Fix: set CF_GATEWAY_NAME to your AI Gateway slug."
    Write-Info "          [Environment]::SetEnvironmentVariable(`"CF_GATEWAY_NAME`", `"<value>`", `"User`")"
    Write-Info "        See docs/SETUP.md section 2."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "unset" -FixLines @(
        "[Environment]::SetEnvironmentVariable(`"CF_GATEWAY_NAME`", `"<value>`", `"User`")"
    )
}

# ---------------------------------------------------------------------------
# Check 5 -- CF_AIG_TOKEN (length only, never the value)
# ---------------------------------------------------------------------------

$idx = 5
$label = "CF_AIG_TOKEN env var"
$val = Get-EnvVar "CF_AIG_TOKEN"
if ($val) {
    $line = Format-CheckLine $idx $label "PASS ($($val.Length) chars)" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail "$($val.Length) chars" -FixLines @()
} else {
    $line = Format-CheckLine $idx $label "FAIL (unset)" ""
    Write-Fail $line
    Write-Info "        Fix: set CF_AIG_TOKEN to your Authenticated Gateway token."
    Write-Info "          [Environment]::SetEnvironmentVariable(`"CF_AIG_TOKEN`", `"<value>`", `"User`")"
    Write-Info "        See docs/SETUP.md section 2."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "unset" -FixLines @(
        "[Environment]::SetEnvironmentVariable(`"CF_AIG_TOKEN`", `"<value>`", `"User`")"
    )
}

# ---------------------------------------------------------------------------
# Check 6 -- OPENCODE_EXPERIMENTAL_LSP_TOOL=true
# ---------------------------------------------------------------------------

$idx = 6
$label = "OPENCODE_EXPERIMENTAL_LSP_TOOL=true"
$val = Get-EnvVar "OPENCODE_EXPERIMENTAL_LSP_TOOL"
if ($val -ceq "true") {
    $line = Format-CheckLine $idx $label "PASS" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail "true" -FixLines @()
} else {
    $current = if ($val) { "currently: '$val'" } else { "currently: unset" }
    $line = Format-CheckLine $idx $label "FAIL ($current)" ""
    Write-Fail $line
    Write-Info "        Fix: set OPENCODE_EXPERIMENTAL_LSP_TOOL=true at user scope."
    Write-Info "          Windows:  [Environment]::SetEnvironmentVariable(`"OPENCODE_EXPERIMENTAL_LSP_TOOL`", `"true`", `"User`")"
    Write-Info "          Unix:     add to your shell rc: export OPENCODE_EXPERIMENTAL_LSP_TOOL=true"
    Write-Info "        See docs/SETUP.md section 3."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail $current -FixLines @(
        "[Environment]::SetEnvironmentVariable(`"OPENCODE_EXPERIMENTAL_LSP_TOOL`", `"true`", `"User`")"
    )
}

# ---------------------------------------------------------------------------
# Check 7 -- opencode.json exists
# ---------------------------------------------------------------------------

$idx = 7
$label = "opencode.json exists"
$configExists = Test-Path $CONFIG_FILE
if ($configExists) {
    $line = Format-CheckLine $idx $label "PASS ($CONFIG_FILE)" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail $CONFIG_FILE -FixLines @()
} else {
    $line = Format-CheckLine $idx $label "FAIL (not found)" ""
    Write-Fail $line
    Write-Info "        Fix: copy opencode.example.json from the repo root to $CONFIG_FILE"
    Write-Info "          or re-run with -InstallConfig to do it automatically."
    Write-Info "        See docs/SETUP.md section 4."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "not found at $CONFIG_FILE" -FixLines @(
        "Re-run with -InstallConfig, or manually copy opencode.example.json to $CONFIG_FILE"
    )
}

# ---------------------------------------------------------------------------
# Check 8 -- Superpowers plugin installed and wired up
# ---------------------------------------------------------------------------

$idx = 8
$label = "Superpowers plugin installed and wired up"
$superpowersDir = Join-Path $CONFIG_DIR "node_modules\superpowers"
$dirExists = Test-Path $superpowersDir

$pluginWired = $false
if ($configExists) {
    try {
        $cfg = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json -ErrorAction Stop
        $pluginArray = $cfg.plugin
        if ($pluginArray) {
            foreach ($entry in $pluginArray) {
                if ($entry -match "superpowers") {
                    $pluginWired = $true
                    break
                }
            }
        }
    } catch {
        # If we can't parse the config, treat wire-up as unknown/false
    }
}

if ($dirExists -and $pluginWired) {
    $line = Format-CheckLine $idx $label "PASS" ""
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail "dir present, wired in plugin array" -FixLines @()
} elseif ($dirExists -and -not $pluginWired) {
    $line = Format-CheckLine $idx $label "FAIL (dir present, but not in plugin array)" ""
    Write-Fail $line
    Write-Info "        Both the directory and the config wire-up are required."
    Write-Info "        Add this entry to the top-level `"plugin`" array in opencode.json:"
    Write-Info "          `"plugin`": [`"~/.config/opencode/node_modules/superpowers`"]"
    Write-Info "        See docs/SETUP.md section 5."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "dir present, not in plugin array" -FixLines @(
        "Add to the plugin array in opencode.json: `"~/.config/opencode/node_modules/superpowers`""
    )
} elseif (-not $dirExists -and $pluginWired) {
    $line = Format-CheckLine $idx $label "FAIL (in plugin array, but dir missing)" ""
    Write-Fail $line
    Write-Info "        Both the directory and the config wire-up are required."
    Write-Info "        Install superpowers:"
    Write-Info "          cd ~/.config/opencode && npm install superpowers"
    Write-Info "        See docs/SETUP.md section 5."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "wired in config but dir missing" -FixLines @(
        "Run: cd $CONFIG_DIR && npm install superpowers"
    )
} else {
    $line = Format-CheckLine $idx $label "FAIL (dir missing, not in plugin array)" ""
    Write-Fail $line
    Write-Info "        Both the directory and the config wire-up are required."
    Write-Info "        1. Install: cd ~/.config/opencode && npm install superpowers"
    Write-Info "        2. Add to the top-level `"plugin`" array in opencode.json:"
    Write-Info "             `"plugin`": [`"~/.config/opencode/node_modules/superpowers`"]"
    Write-Info "        See docs/SETUP.md section 5."
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "dir missing, not in plugin array" -FixLines @(
        "Run: cd $CONFIG_DIR && npm install superpowers",
        "Add to plugin array in opencode.json: `"~/.config/opencode/node_modules/superpowers`""
    )
}

# ---------------------------------------------------------------------------
# Check 9 -- MCP servers in opencode.json
# ---------------------------------------------------------------------------

$idx = 9
$label = "MCP servers in opencode.json"
if (-not $configExists) {
    $line = Format-CheckLine $idx $label "SKIP (opencode.json missing)" ""
    Write-Warn $line
    Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "skipped -- opencode.json missing" -FixLines @(
        "Fix check 7 first (opencode.json must exist)."
    )
} else {
    try {
        $cfg = Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json -ErrorAction Stop
        $mcpObj = $cfg.mcp

        $wantedMcps = @("context7", "cloudflare-docs", "snyk")
        $present    = @()
        $missing    = @()

        foreach ($name in $wantedMcps) {
            $found = $false
            if ($mcpObj) {
                foreach ($prop in $mcpObj.PSObject.Properties) {
                    $server = $prop.Value
                    $propName = $prop.Name
                    # Match by property key name only (strict mode safe -- no .name access)
                    if ($propName -eq $name) {
                        # Check enabled -- absent means enabled by default
                        $enabled = $true
                        $serverEnabled = $server.PSObject.Properties['enabled']
                        if ($null -ne $serverEnabled -and $serverEnabled.Value -eq $false) {
                            $enabled = $false
                        }
                        if ($enabled) { $present += $name } else { $missing += "$name (disabled)" }
                        $found = $true
                        break
                    }
                }
            }
            if (-not $found) { $missing += $name }
        }

        $hasContext7 = $present -contains "context7"

        if ($hasContext7) {
            $detail = $present -join ", "
            if ($missing.Count -gt 0) { $detail += " -- missing: $($missing -join ', ')" }
            $statusStr = if ($missing.Count -gt 0) { "PASS ($detail)" } else { "PASS ($detail)" }
            $line = Format-CheckLine $idx $label $statusStr ""
            Write-Pass $line
            if ($missing.Count -gt 0) {
                Write-Warn "        Warning: $($missing -join ', ') not configured or disabled (optional but useful)."
                Write-Info "        See docs/SETUP.md section 6 to add MCPs."
            }
            Add-Result -Index $idx -Label $label -Passed $true -Optional $false -Detail $detail -FixLines @()
        } else {
            $line = Format-CheckLine $idx $label "FAIL (context7 missing or disabled)" ""
            Write-Fail $line
            Write-Info "        context7 is required. Add it to the mcp block in opencode.json."
            Write-Info "        See docs/SETUP.md section 6."
            Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "context7 missing" -FixLines @(
                "Add context7 to the mcp block in opencode.json. See docs/SETUP.md section 6."
            )
        }
    } catch {
        $line = Format-CheckLine $idx $label "FAIL (could not parse opencode.json)" ""
        Write-Fail $line
        Add-Result -Index $idx -Label $label -Passed $false -Optional $false -Detail "JSON parse error" -FixLines @(
            "Fix JSON syntax in $CONFIG_FILE"
        )
    }
}

# ---------------------------------------------------------------------------
# Check 10 -- Ollama running (optional)
# ---------------------------------------------------------------------------

$idx = 10
$label = "Ollama running"
$ollamaOk = $false
try {
    $ollamaVer = (& ollama --version 2>&1 | Out-String).Trim()
    $null = & ollama list 2>&1
    $ollamaOk = $true
    $line = Format-CheckLine $idx $label "PASS ($ollamaVer)" "optional"
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $true -Detail $ollamaVer -FixLines @()
} catch {
    $line = Format-CheckLine $idx $label "FAIL" "optional"
    Write-Warn $line
    Write-Info "        Local agent tier unavailable. Start Ollama or install from https://ollama.com"
    Add-Result -Index $idx -Label $label -Passed $false -Optional $true -Detail "not running or not installed" -FixLines @(
        "Start Ollama (ollama serve) or install from https://ollama.com"
    )
}

# ---------------------------------------------------------------------------
# Check 11 -- granite4 model pulled (optional, skipped if check 10 failed)
# ---------------------------------------------------------------------------

$idx = 11
$label = "granite4 model pulled"
if (-not $ollamaOk) {
    $line = Format-CheckLine $idx $label "SKIP (Ollama not running)" "optional"
    Write-Warn $line
    Add-Result -Index $idx -Label $label -Passed $false -Optional $true -Detail "skipped -- Ollama not running" -FixLines @()
} else {
    try {
        $ollamaList = (& ollama list 2>&1 | Out-String)
        if ($ollamaList -match "granite4") {
            $line = Format-CheckLine $idx $label "PASS" "optional"
            Write-Pass $line
            Add-Result -Index $idx -Label $label -Passed $true -Optional $true -Detail "found in ollama list" -FixLines @()
        } else {
            $line = Format-CheckLine $idx $label "FAIL (not in ollama list)" "optional"
            Write-Warn $line
            Write-Info "        Fix: ollama pull granite4:7b-a1b-h"
            Add-Result -Index $idx -Label $label -Passed $false -Optional $true -Detail "not in ollama list" -FixLines @(
                "ollama pull granite4:7b-a1b-h"
            )
        }
    } catch {
        $line = Format-CheckLine $idx $label "FAIL (could not query ollama list)" "optional"
        Write-Warn $line
        Add-Result -Index $idx -Label $label -Passed $false -Optional $true -Detail "ollama list failed" -FixLines @()
    }
}

# ---------------------------------------------------------------------------
# Check 12 -- PowerShell 7+ (optional, defensive)
# ---------------------------------------------------------------------------

$idx = 12
$label = "PowerShell 7+"
$psMajor = $PSVersionTable.PSVersion.Major
if ($psMajor -ge 7) {
    $psVer = "v$($PSVersionTable.PSVersion)"
    $line = Format-CheckLine $idx $label "PASS ($psVer)" "optional"
    Write-Pass $line
    Add-Result -Index $idx -Label $label -Passed $true -Optional $true -Detail $psVer -FixLines @()
} else {
    $psVer = "v$($PSVersionTable.PSVersion)"
    $line = Format-CheckLine $idx $label "FAIL ($psVer)" "optional"
    Write-Warn $line
    Write-Info "        Install PowerShell 7+: https://aka.ms/powershell"
    Add-Result -Index $idx -Label $label -Passed $false -Optional $true -Detail $psVer -FixLines @(
        "Install PowerShell 7+: https://aka.ms/powershell"
    )
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

$reqResults  = @($results | Where-Object { -not $_.Optional })
$optResults  = @($results | Where-Object { $_.Optional })
$reqPass     = @($reqResults | Where-Object { $_.Passed }).Count
$reqTotal    = $reqResults.Count
$optPass     = @($optResults | Where-Object { $_.Passed }).Count
$optTotal    = $optResults.Count
$reqFails    = @($reqResults | Where-Object { -not $_.Passed })
$optFails    = @($optResults | Where-Object { -not $_.Passed })

Write-Info ""
Write-Info "========================================================="
Write-Info "Summary"
Write-Info "========================================================="
Write-Info "Required: $reqPass / $reqTotal PASS"
Write-Info "Optional: $optPass / $optTotal PASS"

if ($reqFails.Count -gt 0) {
    Write-Info ""
    Write-Fail "Required failures (must fix before using the repo):"
    foreach ($r in $reqFails) {
        Write-Info "  - [$("{0,2}" -f $r.Index)/$TOTAL_CHECKS] $($r.Label)"
    }
}

if ($optFails.Count -gt 0) {
    Write-Info ""
    Write-Warn "Optional warnings (some features won't work):"
    foreach ($r in $optFails) {
        $detail = if ($r.Detail) { " -- $($r.Detail)" } else { "" }
        Write-Info "  - [$("{0,2}" -f $r.Index)/$TOTAL_CHECKS] $($r.Label)$detail"
    }
}

if ($reqFails.Count -gt 0) {
    Write-Info ""
    Write-Info "Next step: address the required failures above, then re-run this script."
    Write-Info "For the full walkthrough see docs/SETUP.md."
} else {
    Write-Info ""
    Write-Pass "All required checks passed. You can verify model reachability with:"
    Write-Info "  Windows:  .\scripts\verify-models.ps1"
    Write-Info "  Unix:     ./scripts/verify-models.sh"
}

# ---------------------------------------------------------------------------
# -InstallConfig behavior
# ---------------------------------------------------------------------------

if ($InstallConfig) {
    Write-Info ""
    Write-Info "-InstallConfig"
    Write-Info "========================================================="

    $check7 = $results | Where-Object { $_.Index -eq 7 } | Select-Object -First 1

    if ($check7 -and $check7.Passed) {
        Write-Info "opencode.json already exists at $CONFIG_FILE; nothing to copy."
        Write-Info "Pass -InstallConfig only when check 7 has failed."
    } else {
        # Ensure config dir exists
        if (-not (Test-Path $CONFIG_DIR)) {
            New-Item -ItemType Directory -Force -Path $CONFIG_DIR | Out-Null
        }

        # Verify example file is present
        if (-not (Test-Path $EXAMPLE_CFG)) {
            Write-Fail "Cannot install: opencode.example.json not found at $EXAMPLE_CFG"
            Write-Info "Ensure you are running this script from inside the repo."
            exit 2
        }

        # Defensive backup (shouldn't occur since check 7 failed, but be safe)
        if (Test-Path $CONFIG_FILE) {
            $ts   = Get-Date -Format "yyyy-MM-dd-HHmm"
            $bak  = "$CONFIG_FILE.bak.$ts"
            Copy-Item $CONFIG_FILE $bak
            Write-Info "Existing file backed up to: $bak"
        }

        Copy-Item $EXAMPLE_CFG $CONFIG_FILE
        Write-Info "Copied: $EXAMPLE_CFG"
        Write-Info "    to: $CONFIG_FILE"
        Write-Info ""
        Write-Info "Review the file, fill in your env var references, then re-run check-setup.ps1."
    }
}

# ---------------------------------------------------------------------------
# Exit code
# ---------------------------------------------------------------------------

if ($reqFails.Count -gt 0) { exit 1 }
exit 0
