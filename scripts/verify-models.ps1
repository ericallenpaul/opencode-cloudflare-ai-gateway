<#
.SYNOPSIS
  Verifies every model configured in opencode.json is reachable through the
  Cloudflare AI Gateway (or local Ollama) by sending a tiny "say hi" request.

.DESCRIPTION
  Reads the OpenCode configuration file, iterates each provider's models, and
  sends a short test prompt to each through the appropriate endpoint. Writes
  two reports: a human-readable Markdown summary and a machine-readable JSON
  file that can be fed back to an AI assistant for help diagnosing any
  failures.

  Does NOT use the opencode CLI itself — talks directly to the configured
  HTTP endpoints. This is intentional: opencode run is hard to drive
  programmatically (see docs/LEARNINGS.md), and bypassing it lets us isolate
  whether failures are at the gateway, model, or opencode layer.

.PARAMETER ConfigPath
  Path to opencode.json. Defaults to ~/.config/opencode/opencode.json.

.PARAMETER OutputDir
  Directory to write report files into. Defaults to the script's directory.

.PARAMETER Prompt
  Short test prompt. Defaults to a 5-word greeting.

.PARAMETER TimeoutSec
  Per-request timeout. Defaults to 60 seconds (reasoning models can be slow).

.PARAMETER SkipOllama
  Skip local Ollama checks. Useful when Ollama isn't running.

.EXAMPLE
  .\verify-models.ps1

.EXAMPLE
  .\verify-models.ps1 -OutputDir .\reports -TimeoutSec 30
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = "$env:USERPROFILE\.config\opencode\opencode.json",
    [string]$OutputDir = $PSScriptRoot,
    [string]$Prompt = "Reply with exactly: VERIFY OK",
    [int]$TimeoutSec = 60,
    [switch]$SkipOllama
)

$ErrorActionPreference = "Stop"

# --- Env var resolution --------------------------------------------------

function Get-EnvVar([string]$name) {
    $val = [Environment]::GetEnvironmentVariable($name, "User")
    if (-not $val) { $val = [Environment]::GetEnvironmentVariable($name, "Process") }
    return $val
}

$envVars = @{
    CF_ACCOUNT_ID   = Get-EnvVar "CF_ACCOUNT_ID"
    CF_GATEWAY_NAME = Get-EnvVar "CF_GATEWAY_NAME"
    CF_AIG_TOKEN    = Get-EnvVar "CF_AIG_TOKEN"
}

$missing = $envVars.Keys | Where-Object { -not $envVars[$_] }
if ($missing) {
    Write-Host "Missing required env vars: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Set them with:" -ForegroundColor Yellow
    foreach ($v in $missing) {
        Write-Host "  [Environment]::SetEnvironmentVariable('$v', '<value>', 'User')"
    }
    Write-Host "Then open a fresh terminal." -ForegroundColor Yellow
    exit 1
}

function Resolve-EnvSubstitution([string]$s) {
    if (-not $s) { return $s }
    return [Regex]::Replace($s, '\{env:([A-Z_][A-Z0-9_]*)\}', {
        param($m)
        $val = Get-EnvVar $m.Groups[1].Value
        if (-not $val) { throw "Unresolved env var: $($m.Groups[1].Value)" }
        return $val
    })
}

# --- Load config ---------------------------------------------------------

if (-not (Test-Path $ConfigPath)) {
    Write-Host "Config not found at: $ConfigPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

# --- Probe functions per provider type -----------------------------------

function Invoke-Probe {
    param(
        [string]$ProviderKey,
        [string]$ModelKey,
        [string]$Url,
        [hashtable]$Headers,
        [hashtable]$Body,
        [int]$Timeout
    )

    $start = Get-Date
    $jsonBody = $Body | ConvertTo-Json -Depth 10 -Compress
    try {
        $resp = Invoke-RestMethod -Uri $Url -Method Post `
            -Body $jsonBody -Headers $Headers `
            -ContentType "application/json" -TimeoutSec $Timeout

        # Response shape varies by provider; capture whichever content path exists
        $text = $null
        if ($resp.choices)       { $text = $resp.choices[0].message.content }
        elseif ($resp.content)   { $text = ($resp.content | Where-Object type -eq 'text' | Select-Object -First 1).text }
        elseif ($resp.candidates){ $text = $resp.candidates[0].content.parts[0].text }
        if (-not $text) { $text = "(empty response — reasoning model may need higher token budget)" }

        return [PSCustomObject]@{
            provider     = $ProviderKey
            model        = $ModelKey
            status       = "PASS"
            latency_ms   = [int]((Get-Date) - $start).TotalMilliseconds
            response     = ($text -replace '\s+', ' ').Trim().Substring(0, [Math]::Min(120, $text.Length))
            actual_model = $resp.model
            error        = $null
            request_url  = $Url
        }
    } catch {
        $errorBody = $null
        if ($_.ErrorDetails) {
            $errorBody = ($_.ErrorDetails.Message -replace '\s+', ' ').Trim()
            if ($errorBody.Length -gt 400) { $errorBody = $errorBody.Substring(0, 400) + "..." }
        }
        return [PSCustomObject]@{
            provider     = $ProviderKey
            model        = $ModelKey
            status       = "FAIL"
            latency_ms   = [int]((Get-Date) - $start).TotalMilliseconds
            response     = $null
            actual_model = $null
            error        = $errorBody ?? $_.Exception.Message
            request_url  = $Url
        }
    }
}

function Test-AnthropicModel($providerKey, $modelKey, $baseUrl) {
    $url = "$baseUrl/v1/messages"
    Invoke-Probe -ProviderKey $providerKey -ModelKey $modelKey `
        -Url $url -Timeout $TimeoutSec `
        -Headers @{
            "Authorization"     = "Bearer $($envVars.CF_AIG_TOKEN)"
            "anthropic-version" = "2023-06-01"
        } `
        -Body @{
            model      = $modelKey
            max_tokens = 30
            messages   = @(@{ role = "user"; content = $Prompt })
        }
}

function Test-OpenAIModel($providerKey, $modelKey, $baseUrl) {
    $url = "$baseUrl/chat/completions"
    # gpt-5 family and o-series reasoning models require max_completion_tokens
    $isReasoning = $modelKey -match '^(gpt-5|o1|o3|o4)'
    $body = @{
        model    = $modelKey
        messages = @(@{ role = "user"; content = $Prompt })
    }
    if ($isReasoning) { $body.max_completion_tokens = 256 }
    else              { $body.max_tokens = 30 }

    Invoke-Probe -ProviderKey $providerKey -ModelKey $modelKey `
        -Url $url -Timeout $TimeoutSec `
        -Headers @{ "Authorization" = "Bearer $($envVars.CF_AIG_TOKEN)" } `
        -Body $body
}

function Test-GoogleModel($providerKey, $modelKey, $baseUrl) {
    # Google AI Studio openai-compatible endpoint
    $url = "$baseUrl/openai/chat/completions"
    Invoke-Probe -ProviderKey $providerKey -ModelKey $modelKey `
        -Url $url -Timeout $TimeoutSec `
        -Headers @{ "Authorization" = "Bearer $($envVars.CF_AIG_TOKEN)" } `
        -Body @{
            model      = $modelKey
            max_tokens = 30
            messages   = @(@{ role = "user"; content = $Prompt })
        }
}

function Test-OpenAICompatibleModel($providerKey, $modelKey, $baseUrl) {
    $url = "$baseUrl/chat/completions"
    Invoke-Probe -ProviderKey $providerKey -ModelKey $modelKey `
        -Url $url -Timeout $TimeoutSec `
        -Headers @{ "Authorization" = "Bearer $($envVars.CF_AIG_TOKEN)" } `
        -Body @{
            model      = $modelKey
            max_tokens = 30
            messages   = @(@{ role = "user"; content = $Prompt })
        }
}

function Test-OllamaModel($providerKey, $modelKey, $baseUrl) {
    $url = "$baseUrl/chat/completions"
    Invoke-Probe -ProviderKey $providerKey -ModelKey $modelKey `
        -Url $url -Timeout $TimeoutSec `
        -Headers @{} `
        -Body @{
            model      = $modelKey
            messages   = @(@{ role = "user"; content = $Prompt })
            stream     = $false
        }
}

# --- Dispatch by provider type ------------------------------------------

function Test-Provider($providerKey, $provider) {
    $baseUrl = Resolve-EnvSubstitution $provider.options.baseURL
    $npm     = $provider.npm
    $isLocal = $baseUrl -match 'localhost|127\.0\.0\.1'

    $results = @()
    foreach ($prop in $provider.models.PSObject.Properties) {
        $modelKey = $prop.Name

        Write-Host "  $providerKey/$modelKey ... " -NoNewline

        if ($isLocal) {
            if ($SkipOllama) {
                Write-Host "SKIP" -ForegroundColor Yellow
                $results += [PSCustomObject]@{
                    provider     = $providerKey
                    model        = $modelKey
                    status       = "SKIP"
                    latency_ms   = 0
                    response     = "skipped by --SkipOllama"
                    actual_model = $null
                    error        = $null
                    request_url  = $baseUrl
                }
                continue
            }
            $r = Test-OllamaModel $providerKey $modelKey $baseUrl
        }
        elseif ($npm -eq "@ai-sdk/anthropic") {
            $r = Test-AnthropicModel $providerKey $modelKey $baseUrl
        }
        elseif ($npm -eq "@ai-sdk/openai") {
            $r = Test-OpenAIModel $providerKey $modelKey $baseUrl
        }
        elseif ($npm -eq "@ai-sdk/google") {
            $r = Test-GoogleModel $providerKey $modelKey $baseUrl
        }
        else {
            # @ai-sdk/openai-compatible or anything else
            $r = Test-OpenAICompatibleModel $providerKey $modelKey $baseUrl
        }

        if ($r.status -eq "PASS") {
            Write-Host "PASS ($($r.latency_ms)ms)" -ForegroundColor Green
        } else {
            Write-Host "FAIL ($($r.latency_ms)ms)" -ForegroundColor Red
        }
        $results += $r
    }
    return $results
}

# --- Run probes ----------------------------------------------------------

Write-Host ""
Write-Host "opencode-cloudflare-ai-gateway :: verify-models" -ForegroundColor Cyan
Write-Host "Config:       $ConfigPath"
Write-Host "Account ID:   $($envVars.CF_ACCOUNT_ID.Substring(0,8))..."
Write-Host "Gateway:      $($envVars.CF_GATEWAY_NAME)"
Write-Host ""

$allResults = @()
foreach ($prop in $config.provider.PSObject.Properties) {
    $providerKey = $prop.Name
    $provider = $prop.Value
    Write-Host "Provider: $providerKey ($($provider.name))" -ForegroundColor Cyan
    $allResults += Test-Provider $providerKey $provider
    Write-Host ""
}

# --- Summary -------------------------------------------------------------

$pass = ($allResults | Where-Object status -eq "PASS").Count
$fail = ($allResults | Where-Object status -eq "FAIL").Count
$skip = ($allResults | Where-Object status -eq "SKIP").Count
$total = $allResults.Count

Write-Host "Summary: $pass passed, $fail failed, $skip skipped (of $total total)" -ForegroundColor $(if ($fail -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

# --- Write reports -------------------------------------------------------

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$mdPath = Join-Path $OutputDir "verify-models-$timestamp.md"
$jsonPath = Join-Path $OutputDir "verify-models-$timestamp.json"

# Markdown report
$md = @()
$md += "# Model verification report"
$md += ""
$md += "- **Generated:** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
$md += "- **Config:** ``$ConfigPath``"
$md += "- **Gateway:** ``$($envVars.CF_GATEWAY_NAME)``"
$md += "- **Result:** $pass passed, $fail failed, $skip skipped (of $total total)"
$md += ""
$md += "## Results"
$md += ""
$md += "| Provider | Model | Status | Latency | Response / Error |"
$md += "|---|---|---|---|---|"
foreach ($r in $allResults) {
    $emoji = switch ($r.status) { "PASS" {"PASS"} "FAIL" {"FAIL"} default {"SKIP"} }
    $detail = if ($r.status -eq "PASS") {
        ($r.response -replace '\|','\|')
    } else {
        ($r.error -replace '\|','\|')
    }
    $md += "| $($r.provider) | ``$($r.model)`` | $emoji | $($r.latency_ms)ms | $detail |"
}

function Hide-Sensitive([string]$s) {
    if (-not $s) { return $s }
    return $s.Replace($envVars.CF_ACCOUNT_ID, "<account-id>").Replace($envVars.CF_GATEWAY_NAME, "<gateway>").Replace($envVars.CF_AIG_TOKEN, "<aig-token>")
}

if ($fail -gt 0) {
    $md += ""
    $md += "## Failures"
    $md += ""
    $md += "Feed the JSON report (``verify-models-$timestamp.json``) to an AI assistant for help diagnosing. Common causes:"
    $md += ""
    $md += "- **HTTP 400 code 2001** — gateway slug typo OR provider lacks BYOK keys in dashboard"
    $md += "- **HTTP 400 code 2019** — model name format issue (compat endpoint needs prefixes; per-provider endpoints want bare names)"
    $md += "- **HTTP 401** — auth header issue; verify ``CF_AIG_TOKEN`` is fresh and gateway has Authenticated Gateway enabled"
    $md += "- **HTTP 404 / model_not_found** — model name typo or model not accessible from your account"
    $md += "- **HTTP 429** — provider rate-limit or billing issue (e.g. depleted prepayment credits)"
    $md += "- **Connection refused on Ollama** — start ollama service: ``ollama serve`` or restart the Ollama app"
    $md += ""
    $md += "> URLs and identifiers below have been sanitized for safe sharing."
    foreach ($f in ($allResults | Where-Object status -eq "FAIL")) {
        $md += ""
        $md += "### ``$($f.provider)/$($f.model)``"
        $md += ""
        $md += "- **URL:** ``$(Hide-Sensitive $f.request_url)``"
        $md += "- **Error:** $(Hide-Sensitive $f.error)"
    }
}

$md -join "`n" | Set-Content -Path $mdPath -Encoding utf8

# JSON report — sanitize URLs and error bodies so the report can be safely shared
$sanitizedResults = $allResults | ForEach-Object {
    [PSCustomObject]@{
        provider     = $_.provider
        model        = $_.model
        status       = $_.status
        latency_ms   = $_.latency_ms
        response     = $_.response
        actual_model = $_.actual_model
        error        = Hide-Sensitive $_.error
        request_url  = Hide-Sensitive $_.request_url
    }
}
$jsonReport = [PSCustomObject]@{
    generated_at = (Get-Date).ToString("o")
    config_path  = $ConfigPath
    gateway_name = "<gateway>"        # sanitized
    account_id   = "<account-id>"     # sanitized
    summary      = @{
        total   = $total
        passed  = $pass
        failed  = $fail
        skipped = $skip
    }
    results = $sanitizedResults
}
$jsonReport | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonPath -Encoding utf8

Write-Host "Reports written:"
Write-Host "  $mdPath"
Write-Host "  $jsonPath"
Write-Host ""

if ($fail -gt 0) {
    Write-Host "Some models failed. Hand the JSON report to your AI assistant:" -ForegroundColor Yellow
    Write-Host "  '@$jsonPath`'" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

exit 0
