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
        [Parameter(Mandatory)][string]$ApiKey  # value of CLOUDFLARE_API_TOKEN (preferred) or CLOUDFLARE_API_KEY
    )
    $body = @{ query = $Query } | ConvertTo-Json -Depth 4
    $headers = @{ Authorization = "Bearer $ApiKey" }
    $resp = Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/graphql" `
        -Headers $headers -ContentType "application/json" -Body $body
    if ($resp.errors) { throw "GraphQL errors: $($resp.errors | ConvertTo-Json -Depth 6 -Compress)" }
    $accounts = @($resp.data.viewer.accounts)
    if ($accounts.Count -eq 0) { throw "No account returned for the given accountTag (check CLOUDFLARE_ACCOUNT_ID and token scopes: Account Analytics: Read)" }
    return @($accounts[0].aiGatewayRequestsAdaptiveGroups)
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
    # Prefer CLOUDFLARE_API_TOKEN (Account Analytics: Read + AI Gateway: Read); fall back to CLOUDFLARE_API_KEY.
    # Also check User-scope registry directly: Windows subprocesses (Claude Code, IDE terminals,
    # long-lived shells) don't inherit User-scope env vars set after the parent process started.
    if ($env:CLOUDFLARE_API_TOKEN) {
        $apiKey   = $env:CLOUDFLARE_API_TOKEN
        $apiKeySource = "CLOUDFLARE_API_TOKEN (process)"
    } elseif ([Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')) {
        $apiKey   = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN', 'User')
        $apiKeySource = "CLOUDFLARE_API_TOKEN (user-scope)"
    } elseif ($env:CLOUDFLARE_API_KEY) {
        $apiKey   = $env:CLOUDFLARE_API_KEY
        $apiKeySource = "CLOUDFLARE_API_KEY (process)"
    } elseif ([Environment]::GetEnvironmentVariable('CLOUDFLARE_API_KEY', 'User')) {
        $apiKey   = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_KEY', 'User')
        $apiKeySource = "CLOUDFLARE_API_KEY (user-scope)"
    } else {
        return [ordered]@{ source = "gateway-unavailable"; error = "Missing auth: set CLOUDFLARE_API_TOKEN (preferred) or CLOUDFLARE_API_KEY as a process env var or Windows User-scope env var" }
    }
    if (-not $accountTag -or -not $gateway) {
        return [ordered]@{ source = "gateway-unavailable"; error = "Missing CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID or CF_GATEWAY_NAME" }
    }
    Write-Host "  gateway auth source: $apiKeySource" -ForegroundColor DarkGray
    $startIso = $StartUtc.ToUniversalTime().AddHours(-1).ToString("yyyy-MM-ddTHH:00:00Z")
    try {
        $prevReq = -1.0
        $result  = $null
        for ($i = 1; $i -le $MaxAttempts; $i++) {
            $endIso = (Get-Date).ToUniversalTime().AddHours(1).ToString("yyyy-MM-ddTHH:00:00Z")
            $query  = Get-GatewayCostQuery -AccountTag $accountTag -Gateway $gateway -StartIso $startIso -EndIso $endIso -MetadataLike $RunTag
            $groups = Invoke-GatewayGraphQL -Query $query -ApiKey $apiKey
            if ($null -eq $groups) { $groups = @() }
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
