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
    $startIso = $StartUtc.ToUniversalTime().AddHours(-1).ToString("yyyy-MM-ddTHH:00:00Z")
    try {
        $prevReq = -1.0
        $result  = $null
        for ($i = 1; $i -le $MaxAttempts; $i++) {
            $endIso = (Get-Date).ToUniversalTime().AddHours(1).ToString("yyyy-MM-ddTHH:00:00Z")
            $query  = Get-GatewayCostQuery -AccountTag $accountTag -Gateway $gateway -StartIso $startIso -EndIso $endIso -MetadataLike $RunTag
            $groups = Invoke-GatewayGraphQL -Query $query -ApiKey $apiKey
            $result = Convert-GatewayCostResult -Groups $groups
            $req    = [double]$result.total.requests
            Write-Host "  gateway cost poll $i/${MaxAttempts}: $req requests, cost=$($result.total.cost)" -ForegroundColor DarkGray
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
        $msg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = "$msg | $($_.ErrorDetails.Message)" }
        return [ordered]@{ source = "gateway-unavailable"; error = "$msg" }
    }
}
