# Gateway-Sourced OpenCode Cost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture OpenCode's true per-run cost (orchestrator + any Workers AI) from the Cloudflare AI Gateway analytics as the single source of truth, replacing ccusage for OpenCode only. Claude/Codex keep ccusage.

**Architecture:** A new `gateway-cost.ps1` module (pure query-builder + parser, plus a polled HTTP fetch) is dot-sourced by `benchmark-auto.ps1`. Each OpenCode run is tagged with a unique `cf-aig-metadata` app tag (`bench:<benchmark>:<runId>`) via `OPENCODE_APP_TAG`; after the run, the harness queries the gateway GraphQL analytics filtered by that tag and time window, sums cost across all models, writes `opencode/_gateway-cost.json`, and overrides the OpenCode record's `totalCost`. On any failure it falls back to ccusage and flags `gateway-unavailable`.

**Tech Stack:** PowerShell (pwsh), Cloudflare GraphQL Analytics API (`aiGatewayRequestsAdaptiveGroups`), hand-rolled assertion tests (repo has no Pester).

**Reference (verified against live gateway):**
- Endpoint: `POST https://api.cloudflare.com/client/v4/graphql`, auth `Authorization: Bearer $env:CLOUDFLARE_API_KEY` (token scopes: Account Analytics: Read + AI Gateway: Read).
- Dataset path: `viewer.accounts(filter:{accountTag}).aiGatewayRequestsAdaptiveGroups(filter:{gateway, datetimeHour_geq, datetimeHour_leq, metadataRaw_like}, orderBy:[count_DESC])`.
- Returns: `count`, `dimensions { model provider }`, `sum { cost uncachedTokensIn uncachedTokensOut cachedTokensIn cachedTokensOut }`. NOTE: there is no `tokensIn/tokensOut` — tokensIn = uncachedTokensIn + cachedTokensIn (same for out).
- `metadataRaw_like: "%<tag>%"` filtering is confirmed working; datetime format is ISO8601 `"2026-05-31T16:00:00Z"` (hour granularity — the unique metadata tag is the real isolator, the time window just bounds the query).
- Account `003bd42b347c101d299f719f4d804603`, gateway `lvcorp-ais_services-nonprod`.

---

## File Structure

- Create `benchmarks/scripts/gateway-cost.ps1` — query builder, response parser, polled fetch, orchestrator. One responsibility: turn a run tag + time window into a cost result object.
- Create `benchmarks/scripts/tests/gateway-cost.tests.ps1` — unit tests for the pure functions (parser + query builder).
- Create `benchmarks/scripts/tests/fixtures/gateway-cost-sample.json` — sample GraphQL groups array for the parser test.
- Modify `benchmarks/scripts/benchmark-auto.ps1` — per-run tag, run-start timestamp, post-run gateway-cost capture for opencode, markdown summary cost-source line.
- Modify `.env.example` (create if absent) and `AGENTS.md` — document required env vars.

---

## Task 1: gateway-cost.ps1 — pure query builder + parser

**Files:**
- Create: `benchmarks/scripts/gateway-cost.ps1`
- Test: `benchmarks/scripts/tests/gateway-cost.tests.ps1`
- Fixture: `benchmarks/scripts/tests/fixtures/gateway-cost-sample.json`

- [ ] **Step 1: Create the fixture** `benchmarks/scripts/tests/fixtures/gateway-cost-sample.json`

```json
[
  { "count": 12, "dimensions": { "model": "gpt-5", "provider": "openai" },
    "sum": { "cost": 0.18, "uncachedTokensIn": 400000, "uncachedTokensOut": 6000, "cachedTokensIn": 100000, "cachedTokensOut": 0 } },
  { "count": 4, "dimensions": { "model": "gpt-5-mini", "provider": "openai" },
    "sum": { "cost": 0.02, "uncachedTokensIn": 50000, "uncachedTokensOut": 1500, "cachedTokensIn": 0, "cachedTokensOut": 0 } },
  { "count": 3, "dimensions": { "model": "@cf/zai-org/glm-4.7-flash", "provider": "workers-ai" },
    "sum": { "cost": 0.0047, "uncachedTokensIn": 59000, "uncachedTokensOut": 2800, "cachedTokensIn": 0, "cachedTokensOut": 0 } }
]
```

- [ ] **Step 2: Write the failing test** `benchmarks/scripts/tests/gateway-cost.tests.ps1`

```powershell
# Hand-rolled assertions (repo convention; no Pester).
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "..\gateway-cost.ps1")

$failures = 0
function Assert-Equal($actual, $expected, $msg) {
    if ([math]::Abs([double]$actual - [double]$expected) -gt 1e-9) {
        Write-Host "FAIL: $msg (expected $expected, got $actual)" -ForegroundColor Red
        $script:failures++
    } else { Write-Host "PASS: $msg" -ForegroundColor Green }
}
function Assert-Contains($haystack, $needle, $msg) {
    if ($haystack -notlike "*$needle*") {
        Write-Host "FAIL: $msg (missing '$needle')" -ForegroundColor Red
        $script:failures++
    } else { Write-Host "PASS: $msg" -ForegroundColor Green }
}

# Parser test
$groups = Get-Content (Join-Path $PSScriptRoot "fixtures\gateway-cost-sample.json") -Raw | ConvertFrom-Json
$result = Convert-GatewayCostResult -Groups $groups
Assert-Equal $result.total.cost 0.2047 "total cost sums all models incl workers-ai"
Assert-Equal $result.total.requests 19 "total requests sums counts"
Assert-Equal $result.total.tokensIn 609000 "tokensIn = uncached + cached in"
Assert-Equal $result.total.tokensOut 10300 "tokensOut = uncached + cached out"
Assert-Equal $result.models.Count 3 "three model rows"

# Query builder test
$q = Get-GatewayCostQuery -AccountTag "ACC" -Gateway "GW" -StartIso "2026-06-01T00:00:00Z" -EndIso "2026-06-01T23:00:00Z" -MetadataLike "bench:tic-tac-toe:RUN1"
Assert-Contains $q 'accountTag: "ACC"' "query has account tag"
Assert-Contains $q 'gateway: "GW"' "query has gateway"
Assert-Contains $q 'metadataRaw_like: "%bench:tic-tac-toe:RUN1%"' "query has metadata filter"
Assert-Contains $q 'datetimeHour_geq: "2026-06-01T00:00:00Z"' "query has start"

if ($failures -gt 0) { Write-Host "$failures failure(s)" -ForegroundColor Red; exit 1 }
Write-Host "All gateway-cost tests passed" -ForegroundColor Green
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pwsh -NoProfile -File benchmarks/scripts/tests/gateway-cost.tests.ps1`
Expected: FAIL — `gateway-cost.ps1` does not exist / functions not defined.

- [ ] **Step 4: Implement** `benchmarks/scripts/gateway-cost.ps1`

```powershell
# gateway-cost.ps1
# Pull per-run OpenCode cost from the Cloudflare AI Gateway analytics (single source of truth,
# includes Workers AI). Used by benchmark-auto.ps1 for the opencode tool only.

function Get-GatewayCostQuery {
    param(
        [Parameter(Mandatory)][string]$AccountTag,
        [Parameter(Mandatory)][string]$Gateway,
        [Parameter(Mandatory)][string]$StartIso,
        [Parameter(Mandatory)][string]$EndIso,
        [Parameter(Mandatory)][string]$MetadataLike
    )
    return @"
{
  viewer {
    accounts(filter: { accountTag: "$AccountTag" }) {
      aiGatewayRequestsAdaptiveGroups(
        limit: 100
        filter: {
          gateway: "$Gateway"
          datetimeHour_geq: "$StartIso"
          datetimeHour_leq: "$EndIso"
          metadataRaw_like: "%$MetadataLike%"
        }
        orderBy: [count_DESC]
      ) {
        count
        dimensions { model provider }
        sum { cost uncachedTokensIn uncachedTokensOut cachedTokensIn cachedTokensOut }
      }
    }
  }
}
"@
}

function Convert-GatewayCostResult {
    param([Parameter(Mandatory)]$Groups)
    $models = @()
    $totCost = 0.0; $totIn = 0.0; $totOut = 0.0; $totReq = 0.0
    foreach ($g in @($Groups)) {
        $cost = [double]$g.sum.cost
        $tin  = [double]$g.sum.uncachedTokensIn + [double]$g.sum.cachedTokensIn
        $tout = [double]$g.sum.uncachedTokensOut + [double]$g.sum.cachedTokensOut
        $req  = [double]$g.count
        $models += [ordered]@{
            model    = [string]$g.dimensions.model
            provider = [string]$g.dimensions.provider
            requests = $req
            tokensIn = $tin
            tokensOut= $tout
            cost     = $cost
        }
        $totCost += $cost; $totIn += $tin; $totOut += $tout; $totReq += $req
    }
    return [ordered]@{
        total  = [ordered]@{ cost = $totCost; tokensIn = $totIn; tokensOut = $totOut; requests = $totReq }
        models = $models
    }
}

function Invoke-GatewayGraphQL {
    param(
        [Parameter(Mandatory)][string]$Query,
        [Parameter(Mandatory)][string]$ApiKey
    )
    $body = @{ query = $Query } | ConvertTo-Json -Depth 4
    $headers = @{ Authorization = "Bearer $ApiKey" }
    $resp = Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/graphql" `
        -Headers $headers -ContentType "application/json" -Body $body
    if ($resp.errors) { throw "GraphQL errors: $($resp.errors | ConvertTo-Json -Depth 6 -Compress)" }
    return @($resp.data.viewer.accounts[0].aiGatewayRequestsAdaptiveGroups)
}

function Get-OpenCodeGatewayCost {
    param(
        [Parameter(Mandatory)][string]$RunTag,
        [Parameter(Mandatory)][datetime]$StartUtc,
        [int]$MaxAttempts = 6,
        [int]$DelaySeconds = 10
    )
    $accountTag = if ($env:CLOUDFLARE_ACCOUNT_ID) { $env:CLOUDFLARE_ACCOUNT_ID } else { $env:CF_ACCOUNT_ID }
    $gateway    = $env:CF_GATEWAY_NAME
    $apiKey     = $env:CLOUDFLARE_API_KEY
    if (-not $accountTag -or -not $gateway -or -not $apiKey) {
        return [ordered]@{ source = "gateway-unavailable"; error = "Missing CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID, CF_GATEWAY_NAME, or CLOUDFLARE_API_KEY" }
    }
    $startIso = $StartUtc.AddHours(-1).ToString("yyyy-MM-ddTHH:00:00Z")
    try {
        $prevReq = -1.0
        $result  = $null
        for ($i = 1; $i -le $MaxAttempts; $i++) {
            $endIso = (Get-Date).ToUniversalTime().AddHours(1).ToString("yyyy-MM-ddTHH:00:00Z")
            $query  = Get-GatewayCostQuery -AccountTag $accountTag -Gateway $gateway -StartIso $startIso -EndIso $endIso -MetadataLike $RunTag
            $groups = Invoke-GatewayGraphQL -Query $query -ApiKey $apiKey
            $result = Convert-GatewayCostResult -Groups $groups
            $req    = [double]$result.total.requests
            Write-Host "  gateway cost poll $i/$MaxAttempts: $req requests, cost=$($result.total.cost)" -ForegroundColor DarkGray
            if ($req -gt 0 -and $req -eq $prevReq) { break }
            $prevReq = $req
            if ($i -lt $MaxAttempts) { Start-Sleep -Seconds $DelaySeconds }
        }
        if ([double]$result.total.requests -le 0) {
            return [ordered]@{ source = "gateway-unavailable"; error = "No gateway requests found for tag $RunTag"; queryStartIso = $startIso }
        }
        $result.source    = "gateway"
        $result.runTag    = $RunTag
        $result.queriedAt = (Get-Date).ToUniversalTime().ToString("o")
        return $result
    } catch {
        return [ordered]@{ source = "gateway-unavailable"; error = "$($_.Exception.Message)" }
    }
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `pwsh -NoProfile -File benchmarks/scripts/tests/gateway-cost.tests.ps1`
Expected: PASS — "All gateway-cost tests passed".

- [ ] **Step 6: Commit**

```bash
git add benchmarks/scripts/gateway-cost.ps1 benchmarks/scripts/tests/gateway-cost.tests.ps1 benchmarks/scripts/tests/fixtures/gateway-cost-sample.json
git commit -m "feat: gateway-cost module (query builder, parser, polled fetch)"
```

---

## Task 2: Per-run OpenCode metadata tag

**Files:**
- Modify: `benchmarks/scripts/benchmark-auto.ps1` (function `New-InvocationScript`, ~lines 293-343; opencode case ~327-335 sets `$env:OPENCODE_APP_TAG = '$escapedAppTag'`).

- [ ] **Step 1: Read `New-InvocationScript`** to see how `$escapedAppTag` is derived (currently the repo leaf name, ~line 302) and how the function is called in the main loop.

- [ ] **Step 2: Thread a unique tag.** Add a parameter `[string]$AppTag` to `New-InvocationScript`. Replace the `$escapedAppTag` derivation so it escapes the passed `$AppTag` for single quotes: `$escapedAppTag = $AppTag -replace "'","''"`. At the call site in the main per-tool loop, pass `-AppTag "bench:$Benchmark:$RunId"`. (`$Benchmark` and `$RunId` are in scope in the main script.) Leave the opencode case body unchanged — it already emits `$env:OPENCODE_APP_TAG = '$escapedAppTag'`.

- [ ] **Step 3: Verify with a dry run**

Run: `pwsh -NoProfile -File benchmarks/scripts/benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode -DryRun -SkipJudge`
Expected: succeeds; the generated invoke script for opencode contains `$env:OPENCODE_APP_TAG = 'bench:tic-tac-toe:<runId>'`. (Inspect the generated invoke-opencode script under the scratch run dir, or add a temporary Write-Host of the script if needed, then remove it.)

- [ ] **Step 4: Commit**

```bash
git add benchmarks/scripts/benchmark-auto.ps1
git commit -m "feat: tag opencode runs with per-run cf-aig-metadata app tag"
```

---

## Task 3: Capture gateway cost after the OpenCode run

**Files:**
- Modify: `benchmarks/scripts/benchmark-auto.ps1` — per-tool loop: capture run-start timestamp before invocation (~line 547); after the `$record` is assembled and BEFORE it is written to `_run-result.json` (~lines 615-618), add the opencode-only gateway-cost block.

- [ ] **Step 1: Capture run-start UTC.** Immediately before the tool is invoked via `Invoke-LoggedProcess` (~line 547), add: `$toolStartUtc = (Get-Date).ToUniversalTime()`.

- [ ] **Step 2: Add the capture block** after `$record = [ordered]@{ ... }` is fully built (after ~line 615) and before `$record | ConvertTo-Json -Depth 12 | Set-Content ...` (~line 617):

```powershell
    if ($tool -eq "opencode" -and -not $DryRun) {
        . (Join-Path $PSScriptRoot "gateway-cost.ps1")
        $runTag = "bench:$Benchmark:$RunId"
        Write-Host "  querying gateway analytics for $runTag ..." -ForegroundColor Cyan
        $gwCost = Get-OpenCodeGatewayCost -RunTag $runTag -StartUtc $toolStartUtc
        $gwCost | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $resultToolDir "_gateway-cost.json") -Encoding utf8
        if ($gwCost.source -eq "gateway") {
            $record.metrics.totalCost = [double]$gwCost.total.cost
            $record | Add-Member -NotePropertyName costSource -NotePropertyValue "gateway" -Force
            Write-Host "  opencode cost (gateway): $($gwCost.total.cost)" -ForegroundColor Green
        } else {
            $record | Add-Member -NotePropertyName costSource -NotePropertyValue "ccusage (gateway-unavailable: $($gwCost.error))" -Force
            Write-Host "  gateway unavailable, keeping ccusage cost: $($gwCost.error)" -ForegroundColor Yellow
        }
    }
```

NOTE: `$record` is an `[ordered]` hashtable; if `Add-Member` errors on a hashtable in this pwsh version, instead set `$record.costSource = "gateway"` / `$record.costSource = "ccusage (...)"` directly (ordered hashtables accept new keys by assignment). Use whichever the existing code style supports; prefer direct key assignment `$record.costSource = ...`.

- [ ] **Step 3: Verify the JSON write path** with a dry run (no gateway call happens under -DryRun):

Run: `pwsh -NoProfile -File benchmarks/scripts/benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode -DryRun -SkipJudge`
Expected: completes without error; no `_gateway-cost.json` written (block is skipped under -DryRun). Confirms the edit doesn't break the dry path.

- [ ] **Step 4: Commit**

```bash
git add benchmarks/scripts/benchmark-auto.ps1
git commit -m "feat: source opencode cost from gateway analytics with ccusage fallback"
```

---

## Task 4: Surface cost source in the markdown summary

**Files:**
- Modify: `benchmarks/scripts/benchmark-auto.ps1` — `Write-MarkdownSummary` (~lines 455-483; cost line at ~476).

- [ ] **Step 1: Add a cost-source line.** After the existing `$lines += "- CostUSD: $($record.metrics.totalCost)"` (~line 476), add:

```powershell
        if ($record.PSObject.Properties.Name -contains "costSource" -or ($record -is [System.Collections.IDictionary] -and $record.Contains("costSource"))) {
            $lines += "- CostSource: $($record.costSource)"
        }
```

- [ ] **Step 2: Verify** with the dry run from Task 3 Step 3; confirm the summary still generates (CostSource line simply absent under dry run). 

Run: `pwsh -NoProfile -File benchmarks/scripts/benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode -DryRun -SkipJudge`
Expected: completes; `<runId>-auto.md` generated without error.

- [ ] **Step 3: Commit**

```bash
git add benchmarks/scripts/benchmark-auto.ps1
git commit -m "feat: show opencode cost source in run summary"
```

---

## Task 5: Document required env vars

**Files:**
- Modify/Create: `.env.example`
- Modify: `AGENTS.md`

- [ ] **Step 1: Read** `.env.example` (if present) and the env/setup section of `AGENTS.md`.

- [ ] **Step 2: Add documentation** for the analytics credentials. Append to `.env.example` (create it if absent), matching existing style:

```
# Cloudflare AI Gateway analytics (used to source OpenCode cost as single source of truth)
# API token needs: Account Analytics: Read + AI Gateway: Read
CLOUDFLARE_ACCOUNT_ID=003bd42b347c101d299f719f4d804603
CLOUDFLARE_API_KEY=
CF_GATEWAY_NAME=lvcorp-ais_services-nonprod
```

Add a one-line note in `AGENTS.md` (in the benchmark/cost section) that OpenCode cost is sourced from the gateway analytics (includes Workers AI) while Claude/Codex use ccusage, and that `CLOUDFLARE_API_KEY` (Analytics+Gateway Read) is required.

- [ ] **Step 3: Commit**

```bash
git add .env.example AGENTS.md
git commit -m "docs: document gateway analytics env vars for opencode cost"
```

---

## Task 6: Live integration verification (manual, no auto-test)

**Files:** none (verification only).

- [ ] **Step 1: Run one real tagged opencode benchmark** (small target):

Run: `pwsh -NoProfile -File benchmarks/scripts/benchmark-auto.ps1 -Benchmark tic-tac-toe -Tools opencode -SkipJudge`
Expected: after the run, console shows the gateway poll lines and `opencode cost (gateway): <n>`; `benchmarks/tic-tac-toe/results/runs/<runId>/opencode/_gateway-cost.json` exists with `source: "gateway"`, a per-model breakdown, and a non-zero `total.cost`; the `_run-result.json` `metrics.totalCost` equals the gateway total and `costSource` is `gateway`.

- [ ] **Step 2: Confirm isolation** — open `_gateway-cost.json` and verify the models listed correspond to that single run (gpt-5 + gpt-5-mini for current config), and the cost is in a plausible range (compare to the ccusage figure for sanity; gateway is authoritative).

- [ ] **Step 3: Negative path** — temporarily unset `CLOUDFLARE_API_KEY` in a scratch shell and run again; expect `_gateway-cost.json` `source: "gateway-unavailable"` and `_run-result.json` `costSource` noting the fallback, with the ccusage cost retained. Restore the env var after.

---

## Self-review notes
- Spec coverage: per-run tagging (Task 2), gateway capture (Task 1+3), source-of-truth override (Task 3), reporting (Task 4), failure handling (Get-OpenCodeGatewayCost + Task 3 fallback), config docs (Task 5), live verification (Task 6). All spec sections covered.
- Token fields use `uncached*+cached*` (no `tokensIn/out` on the schema) — consistent across parser, fixture, and test.
- Current opencode runs are gpt-5/gpt-5-mini (coder kept on gpt-5-mini); Workers AI rows will appear only if GLM is used again — the parser handles both identically.
