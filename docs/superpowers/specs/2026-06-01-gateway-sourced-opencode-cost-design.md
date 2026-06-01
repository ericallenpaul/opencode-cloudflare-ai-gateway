# Gateway-Sourced OpenCode Cost — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorm), pending implementation plan
**Scope:** OpenCode cost measurement only. Claude Code and Codex are unchanged (they keep using ccusage).

## Problem

The benchmark compares claude / codex / opencode on cost. OpenCode is the only tool routed through the Cloudflare AI Gateway, and it uses Workers AI (`@cf/zai-org/glm-4.7-flash`) for its `searcher`/`reader`/`planner` subagents. Cost is currently captured with the `ccusage` npm tool, which reads each CLI's local session logs. ccusage does not price the Workers AI / OSS subagent calls (they show ~$0), so OpenCode's reported cost is understated and not comparable. The published run `281fd43` (`react-todo-api-db` run `2026-05-31-164112`) reported OpenCode at $0.193, which is incomplete.

## Key finding (empirical)

Querying the live gateway (`lvcorp-ais_services-nonprod`) proved the gateway analytics DOES report accurate USD cost for every provider, including Workers AI:

| model | provider | requests | cost (USD) |
|---|---|---|---|
| gpt-5 | openai | 196 | $2.90 |
| gpt-5-mini | openai | 208 | $0.60 |
| `@cf/zai-org/glm-4.7-flash` | workers-ai | 3 | $0.0047 |

GLM-4.7-Flash is reached via the gateway's `workers-ai/v1` path (not the direct Workers AI API), so a single query to gateway analytics sees all OpenCode traffic. This means no Responses-API proxy and no `cf-aig-custom-cost` injection are needed.

- **Auth:** `CLOUDFLARE_API_KEY` as `Authorization: Bearer` works. Required token scopes: **Account Analytics: Read** (GraphQL cost dataset) and **AI Gateway: Read** (Logs REST). `CF_AIG_TOKEN` is gateway-scoped only and does NOT work for analytics.
- **Filtering:** `metadataRaw` is a queryable/filterable dimension in `aiGatewayRequestsAdaptiveGroups`. OpenCode requests already carry `cf-aig-metadata` populated from `OPENCODE_APP_TAG` / `OPENCODE_USER_TAG`.

## Design

### 1. Per-run tagging
`benchmarks/scripts/benchmark-auto.ps1` sets `OPENCODE_APP_TAG` to a unique per-run value (format `bench:<benchmark>:<runId>`) before invoking OpenCode. `opencode.json` already injects this into the `cf-aig-metadata` header, so every gateway request for the run is filterable by `metadataRaw`. (Today `OPENCODE_APP_TAG` is unset, so all runs share one tag and cannot be isolated — this is why historical runs cannot be reconstructed.)

### 2. Gateway cost capture (OpenCode only)
After the OpenCode run completes, a new PowerShell function `Get-GatewayCost` queries the Cloudflare GraphQL Analytics API (`aiGatewayRequestsAdaptiveGroups`) for this account + gateway, filtered by the run's `metadataRaw` tag and a `[runStart, now]` datetime window, grouped by `model`, returning sum `cost`, token counts, and request `count`.

- Auth: `Authorization: Bearer $CLOUDFLARE_API_KEY`. Account from `$CLOUDFLARE_ACCOUNT_ID` (fallback `$CF_ACCOUNT_ID`), gateway from `$CF_GATEWAY_NAME`.
- Ingestion lag: poll with retry (~6 attempts × 10s) until the request count stabilizes (or matches the OpenCode session count), then take totals.
- Output: write `opencode/_gateway-cost.json` with a per-model breakdown (model, provider, requests, tokensIn, tokensOut, cost) plus a `total`.

### 3. Source of truth
OpenCode's published cost becomes the gateway total (orchestrator + Workers AI subagents). ccusage still runs for OpenCode but is recorded as a secondary sanity figure, not the headline. Claude and Codex are untouched (ccusage remains their source).

### 4. Reporting
README leaderboard and `comparisons.md` use the gateway-sourced OpenCode cost, with a one-line methodology note: OpenCode cost is measured at the gateway (single source of truth, includes Workers AI subagents); Claude/Codex use ccusage.

### 5. Failure handling
If the gateway query fails or returns zero requests, flag the run's OpenCode cost as `gateway-unavailable` and fall back to the ccusage figure — never silently mix sources.

### 6. Configuration
Document required env in `.env.example` / `AGENTS.md`: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY` (token with Account Analytics: Read + AI Gateway: Read), `CF_GATEWAY_NAME`. No secrets committed.

## Consequence: historical runs
The published run `281fd43` cannot be reconstructed from the gateway (no per-run tag existed). All three benchmark targets will be re-run with tagging once the capture is implemented, and results republished with gateway-sourced OpenCode costs.

## Out of scope
- Routing Claude Code or Codex through the gateway.
- Any Codex Responses-API → Chat-Completions proxy.
- `cf-aig-custom-cost` injection.
