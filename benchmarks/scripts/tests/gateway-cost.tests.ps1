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
