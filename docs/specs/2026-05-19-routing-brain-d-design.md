# Routing Brain (Flavor D) — Design

**Date:** 2026-05-19
**Status:** Draft, pending user approval
**Project:** OpenCode tiered-agent cost-optimization

## Goal

Lower token costs on a single-developer OpenCode setup by having a frontier orchestrator dispatch trivial / well-scoped work to cheaper subagents (local Ollama, CF Workers AI Qwen 32B). Accept some added latency. Validate via CF AI Gateway analytics.

## Non-goals (v1)

- Hard per-session cost ceilings (would require external routing service — "Option C")
- Custom semantic caching beyond CF AI Gateway's built-in
- Recursive subagent dispatch
- Fixed-task eval harness with nightly cost/quality runs

## Architecture

One config change to OpenCode. **No new services, no separate runtime.** The "routing brain" is a system-prompt-driven dispatch loop inside a primary orchestrator agent, using OpenCode's native Task tool + subagent mechanism.

```
User
  ↓
opencode (default agent = orchestrator)
  ↓
[Primary] orchestrator (gpt-5 via openai-via-gateway)
  ├─ does directly: reasoning, ambiguity, architecture, user dialogue
  └─ Task tool dispatches to subagents:
      ├─ searcher  (subagent, local tier)    grep/glob/find symbols
      ├─ reader    (subagent, local tier)    summarize files, extract info
      ├─ coder     (subagent, oss tier)      edit/write code
      └─ planner   (subagent, oss tier)      design approach, step plans
```

All gateway-bound traffic carries a `cf-aig-metadata` header (`{"app":"opencode","user":"eric-local-dev"}`) so it is filterable in CF AI Gateway analytics, distinct from other clients (and other developers) hitting the same gateway.

**Multi-developer handoff:** This config may be shared with colleagues who use the same CF AI Gateway. The `user` field is the per-developer scope tag. Two options for handling this:
- **v1 (chosen):** hard-code `eric-local-dev`; colleagues edit the value when adopting the config.
- **v2 (deferred):** drive the value from `{env:OPENCODE_USER_TAG}` so each developer sets their own env var with no config edit. Worth adopting at the moment the first colleague picks up the config.

## Components

### Primary agents (user-selectable via `--agent` or `/agent`)

| Agent | Tier | Notes |
|---|---|---|
| `orchestrator` | frontier | **NEW. Default.** `openai-via-gateway/gpt-5` (per user preference, restored 2026-05-20 after adding `@ai-sdk/openai` adapter as separate provider — see "Config & model-naming learnings"). Has `task` permission for dispatch. |
| `frontier` | frontier | Existing. Manual frontier-only override (no dispatch). |
| `oss` | oss | Existing. Manual cheap-tier override. |
| `local` | local | Existing. Manual free-tier override. |

### Subagents (dispatched only via Task tool)

| Name | Tier (model) | Tools | Purpose |
|---|---|---|---|
| `searcher` | local (`ollama/granite4:7b-a1b-h`) | read, grep, glob, lsp | locate files/symbols, codebase exploration |
| `reader` | local (`ollama/granite4:7b-a1b-h`) | read, glob | summarize files, extract specific info |
| `coder` | oss (`workers-ai-via-gateway/@cf/qwen/qwen2.5-coder-32b-instruct`) | read, edit, write, bash | implement code changes from a clear spec |
| `planner` | oss (`workers-ai-via-gateway/@cf/qwen/qwen2.5-coder-32b-instruct`) | read, grep, glob, webfetch | design approach, write step-by-step plans |

Subagents are `mode: subagent`. They do **not** have the `task` permission — no recursive dispatch in v1.

## Orchestrator system prompt (sketch)

The orchestrator's system prompt is the IP of this design. Draft:

> You are the orchestrator for a tiered coding agent. Your goal is to minimize cost while completing the user's task. Before doing work yourself, consider dispatching to a subagent.
>
> **Always dispatch when** the task fits a subagent's specialty:
> - **Locating files/symbols, grepping the repo, finding usages** → `searcher`
> - **Reading and summarizing files, extracting specific info from long files** → `reader`
> - **Implementing a clear, well-scoped code change** → `coder` (provide the change spec, files involved, and expected behavior)
> - **Designing a step-by-step approach for a non-trivial task** → `planner`
>
> **Do yourself when** the task requires:
> - Disambiguating user intent or asking clarifying questions
> - Architectural judgment, novel problem-solving, cross-cutting reasoning
> - Synthesizing subagent outputs into a final answer
> - Final code review before reporting completion
>
> **After a subagent returns**, verify its result rather than trusting blindly. If a subagent fails or produces unusable output, you may retry once with a clearer spec, then do the work yourself.
>
> Dispatch decisions are not visible to the user — communicate progress in plain language.

This prompt will iterate based on validation results.

## Data flow

1. User prompts opencode; default agent = orchestrator
2. Orchestrator reads prompt + applies dispatch rules
3. Orchestrator emits a Task tool call → opencode spawns the named subagent with that subagent's bound model
4. Subagent runs to completion, returns text result to orchestrator
5. Orchestrator integrates result; may dispatch again, ask user, or reply
6. All gateway-bound requests carry `cf-aig-metadata` header → CF AI Gateway analytics

## Configuration changes

Single file: `C:\Users\eric.paul\.config\opencode\opencode.json`

**Changes:**
1. Add `cf-aig-metadata` header to each of the four CF gateway providers' `options.headers` (alongside the existing `Authorization: Bearer {env:CF_AIG_TOKEN}` which the SDK supplies via `apiKey`)
2. Add new primary agent `orchestrator` with `task` permission and dispatch system prompt
3. Add four subagents (`searcher`, `reader`, `coder`, `planner`) as `mode: subagent` with their respective tier bindings and tool permissions
4. Change top-level `model` default from `ollama/granite4:7b-a1b-h` to `openai-via-gateway/gpt-5` (orchestrator is now default)
5. Keep existing `local`, `oss`, `frontier` primary agents as manual overrides

Agent definitions may live inline in `opencode.json` or as separate files under `~/.config/opencode/agent/<name>.md` — decision deferred to plan phase. Markdown files are cleaner for prompts of any length.

## Error handling

| Failure | Behavior |
|---|---|
| Subagent task error | Orchestrator sees error in Task return → decides retry, escalate-to-self, or report |
| Unknown model ID at dispatch | First call 404s fast → pre-flight verification via `opencode models <provider-name>` for each gateway provider |
| Ollama process down | Local subagent calls fail → orchestrator re-dispatches to oss subagent or self |
| CF gateway 5xx | Hard fail to user → can switch to `--agent local` manually |
| `gpt-5` model not in gateway (verification step finds this) | Block plan: pivot orchestrator to `claude-sonnet-4-5` before applying config |

## Validation plan

- **Primary signal:** CF AI Gateway analytics, filtered by `app: opencode` AND `user: eric-local-dev` metadata tags
- **Window:** ≥ 1 week of real use
- **Tier breakdown via model differentiation:**
  - `openai/gpt-5` → orchestrator (frontier tier)
  - `workers-ai/@cf/qwen/qwen2.5-coder-32b-instruct` → coder + planner combined (oss tier)
  - `ollama/granite4:7b-a1b-h` → searcher + reader (local tier, **not visible in CF analytics** — runs locally)
- **Loose targets:**
  - Frontier (orchestrator) request count < 30% of total CF AI Gateway requests
  - OSS subagent request count > 50% of total CF AI Gateway requests
  - If frontier % stays > 50% over a week, tighten dispatch system prompt
- **What we'll miss:** local-tier dispatch frequency (Ollama doesn't hit the gateway). Mitigate later via OpenCode session logs if needed.

## Open items / risks

1. **Model name verification:** `gpt-5` must exist in CF AI Gateway's OpenAI provider catalogue. Pre-flight check before applying config.
2. **Subagent context handoff:** OpenCode's Task tool semantics — does the subagent see the orchestrator's full context, or just the dispatch message? Affects how detailed the orchestrator's Task input must be.
3. **Dispatch overhead:** Each Task call adds an orchestrator round-trip. For a session with many small dispatches, total latency may grow. Worth measuring in first week of use.
4. **Sloppy dispatch:** Orchestrators sometimes ignore "dispatch first" prompts and do work themselves. May require prompt tightening or even moving to deterministic external routing (Option C) if too sloppy.

## Config & model-naming learnings (2026-05-20)

Empirical findings while wiring this up — capture so we don't relearn:

- **OpenCode sends the model `key`, not the `name` field**, to the upstream API. The `name` field appears to be display-only (or at least unreliable for routing). Workaround: make `key` equal what the upstream expects on the wire.
  - For Ollama: key = exact Ollama model tag (`granite4:7b-a1b-h`, `qwen2.5-coder:7b-instruct-q4_K_M`)
  - For CF AI Gateway compat endpoint: key = `<provider>/<model>` (e.g., `anthropic/claude-haiku-4-5`, `workers-ai/@cf/qwen/qwen2.5-coder-32b-instruct`)
- **CF AI Gateway compat endpoint requires the provider prefix** in the request body's `model` field. Sending bare `claude-haiku-4-5` → HTTP 400 with code 2019 "Chat completion bad format". Sending `anthropic/claude-haiku-4-5` → routes correctly.
- **OpenCode sends `max_tokens: 32000` by default for frontier agents.** That exceeds some models' output limits (Haiku 4.5 max output is lower than Sonnet/Opus). If we see a max_tokens error after the model-name fix, tune via the agent's `temperature`/`top_p`/`steps`/`maxTokens` fields or per-model config.

- **OpenCode + OpenAI reasoning-model family (gpt-5, gpt-5-mini, o-series) requires `@ai-sdk/openai`, NOT `@ai-sdk/openai-compatible`.** Captured request body via the openai-compatible adapter showed a malformed combination: `reasoningSummary: "auto"` (camelCase — rejected by OpenAI as unknown parameter) alongside `reasoning_effort: "medium"` (snake_case — accepted), plus `max_tokens: 32000` where the model requires `max_completion_tokens`. The openai-compatible adapter's reasoning-model support is incomplete. **Fix (verified 2026-05-20):** add a separate provider `openai-via-gateway` using `npm: "@ai-sdk/openai"` pointed at CF AI Gateway's per-provider openai endpoint (`/v1/{acc}/{gw}/openai`, NOT `/compat`). The proper openai SDK handles reasoning-model conventions (max_completion_tokens, nested reasoning params, snake_case fields) correctly. Curl confirmed: `gpt-5` and `gpt-5-mini` return clean responses (`reasoning_tokens=64`) at the openai endpoint. Auth: same `Authorization: Bearer {CF_AIG_TOKEN}` pattern as compat.



- **qwen2.5-coder:7b (Q4) is not viable as a tool-calling model.** Direct Ollama probe: when given a `write` tool definition, the model emits the tool call as a JSON code block in the `content` field instead of using the proper `tool_calls` response field. Unparseable by any OpenAI-compatible client. Fine for raw chat without tools, fine for code completion, but **broken for agentic loops**.
- **granite4:7b-a1b-h is purpose-fit.** IBM Granite 4, MoE (7B total / 1B active), explicitly tuned for agentic use. Probed with the same tools:
  - Casual prompt + read-only tools → clean text reply, no spurious tool call
  - Realistic searcher prompt → properly emits `tool_calls` with the right function and arguments, `finish_reason: tool_calls`
  - Fits comfortably in 8 GB VRAM (4.2 GB on disk)
- **OpenCode's `tools: {name: false}` agent field is `@deprecated`** in the schema — exposure-level tool suppression at the agent level may be unreliable. Either the modern `permission` field controls runtime denial (not exposure), or tool exposure is driven elsewhere. Worth empirically retesting with granite4 before relying on tool-level config to gate behavior.
- **qwen2.5-coder:7b stays in the provider's model list** (referenced as `ollama/qwen2.5-coder:7b-instruct-q4_K_M`) — available for raw-chat / completion use cases where tool calling isn't needed. Just not for subagent roles.

## Out of scope (deferred phases)

- **Eval harness:** fixed task set, nightly runs, cost-per-success metric
- **Per-subagent metadata:** distinguish coder vs planner in analytics (both use same model)
- **Deterministic external routing:** Option C, only if D proves too sloppy
- **Cost ceilings per session:** hard limits enforced in code
- **Recursive subagent dispatch:** subagent spawning sub-subagents
