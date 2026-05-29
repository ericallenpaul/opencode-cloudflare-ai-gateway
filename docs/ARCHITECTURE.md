# Architecture

> **Pricing note:** dollar figures below are "as of May 2026" and indicative only. They exist to convey **rough order-of-magnitude** differences between tiers, not as a current rate card. Always check the provider's own published pricing before making cost decisions — it moves fast.

## The Current Routing Shape

The architecture is no longer a simple three-tier ladder where "cheaper" automatically means "better." The current design is reliability-based:

- `build` stays on `gpt-5` and owns judgment, decomposition, fallback, final verification, and the user-facing answer.
- `coder` runs on `gpt-5-mini` because benchmark evidence showed it is the cheapest implementation worker that stayed reliable on the markdown-editor target.
- `searcher`, `reader`, and `planner` run on GLM 4.7 Flash because those roles are bounded enough for a very cheap hosted OSS model.
- `local` remains a manual/experimental read-only override, not the recommended default implementation path.

## Provider Shape

```
┌─────────────────────────────────────────────────────────────┐
│                       OpenCode                              │
│                                                             │
│   --agent local      --agent oss      --agent frontier      │
│        │                  │                  │              │
│        ▼                  ▼                  ▼              │
└────────┼──────────────────┼──────────────────┼──────────────┘
         │                  │                  │
         │                  │                  │
    ┌────▼────┐        ┌────▼─────────────────────────────┐
    │ Ollama  │        │     Cloudflare AI Gateway        │
    │ (local) │        │  ┌────────────────────────────┐  │
    │         │        │  │ /anthropic   /openai       │  │
    │ granite4│        │  │ /google-ai-studio          │  │
    │ qwen3   │        │  │ /workers-ai                │  │
    └─────────┘        │  └──────────┬─────────────────┘  │
                       │             │                    │
                       │   BYOK: provider keys stored     │
                       │   gateway-side. Single client    │
                       │   auth token covers all.         │
                       └─────────────┼────────────────────┘
                                     │
        ┌────────────────┬───────────┼──────────────┬────────────┐
        ▼                ▼           ▼              ▼            ▼
    Anthropic        OpenAI     Google AI    CF Workers AI    (Groq/xAI
    Claude 4.5/4.6   GPT-5,etc  Gemini 2.5   Qwen/Llama/DS    deferred)
```

## Why this shape

The early version of this repo looked like a three-tier cost story: local, OSS, frontier. That was too coarse. The markdown-editor benchmark showed that assigning implementation to the cheapest compatible model can be false economy: GLM routed correctly but produced unsafe and incomplete output. The current architecture separates "mechanical cheap work" from "implementation cheap work."

### Tier 1 — Local (Ollama)
- **Cost:** free (your hardware)
- **Latency:** fastest network-wise (loopback)
- **Capability ceiling:** ~7B-class instruction-tuned models
- **Tool-calling reliability:** depends entirely on model choice. Granite4 is purpose-built for this and handles tool calls correctly; qwen2.5-coder:7b emits malformed tool-call JSON in the content field and is unusable for agent loops (see LEARNINGS).
- **Sweet spot:** code search, file reads, file summarization, completion-only work

### Tier 2 — Mechanical cheap workers (Cloudflare Workers AI via Gateway)
- **Cost (May 2026, indicative):** sub-dollar per million tokens for most listed models — roughly an order of magnitude or more below frontier on like-for-like work
- **Latency:** ~1s typical
- **Capability ceiling:** competitive with prior-generation frontier (Qwen 2.5 Coder 32B, Llama 3.3 70B, DeepSeek-R1-distill)
- **Sweet spot:** search, file reading, summarization, narrow planning, and mechanical context extraction. Recent benchmark evidence showed GLM 4.7 Flash is not reliable enough as the default implementation coder on harder app-building tasks.

### Tier 2.5 — Cheap hosted implementation worker
- **Default model:** `openai-via-gateway/gpt-5-mini`
- **Cost (May 2026, indicative):** materially below frontier orchestration while preserving much better coding reliability than the hosted OSS coder attempt
- **Sweet spot:** concrete implementation tasks with clear acceptance criteria, tests, README generation, and scoped fixes
- **Evidence:** the markdown-editor architecture run `2026-05-27-103313` completed in about 4.5 minutes at $0.1416 using `gpt-5` + `gpt-5-mini`; the all-tool run `2026-05-27-105622` kept OpenCode valid and core-functional at $0.3888, versus Codex at $1.0080 and Claude at $1.2273.

### Tier 3 — Frontier (Anthropic / OpenAI / Google via Gateway)
- **Cost (May 2026, indicative):** multi-dollar per million tokens; reasoning-model output is more expensive than non-reasoning even on the same provider
- **Latency:** ~2–10s for frontier; reasoning models spend time on internal reasoning before output
- **Capability ceiling:** current state of the art
- **Sweet spot:** novel reasoning, architecture decisions, ambiguous intent, large-context synthesis, final code review

## Why one gateway instead of direct connections

The gateway gives us five things we can't get with direct provider connections:

| Capability | How |
|---|---|
| **Unified analytics** | Every paid request appears in one dashboard with model, tokens, cost, latency. |
| **Per-user attribution** | `cf-aig-metadata` header tags each request with `{app, user}`. Filter the dashboard by user to see who spent what. |
| **BYOK key storage** | Provider keys live in gateway settings, not on user machines. Revoke / rotate centrally. |
| **Free caching** | Identical requests within the cache window cost nothing extra. Particularly useful for agent loops. |
| **Fallbacks and rate limits** | If a provider is down, gateway can fall back to another. Hard rate limits prevent runaway spend. |

The cost: one extra network hop (~50–150ms observed at time of publish).

## Provider configuration pattern

Each upstream gets its own OpenCode provider entry using the **proper SDK** (not openai-compatible) wherever possible, pointed at the gateway's **per-provider endpoint**:

| Provider key | npm package | Gateway endpoint |
|---|---|---|
| `anthropic-via-gateway` | `@ai-sdk/anthropic` | `/anthropic` |
| `openai-via-gateway` | `@ai-sdk/openai` | `/openai` |
| `google-via-gateway` | `@ai-sdk/google` | `/google-ai-studio/v1beta` |
| `workers-ai-via-gateway` | `@ai-sdk/openai-compatible` | `/workers-ai/v1` |
| `ollama` | `@ai-sdk/openai-compatible` | `http://127.0.0.1:11434/v1` |

**Why proper SDKs over `@ai-sdk/openai-compatible`-for-everything:** the openai-compatible adapter doesn't fully translate between OpenAI's request shape and each provider's native one. OpenAI reasoning models in particular (gpt-5 family) require `max_completion_tokens` not `max_tokens` and have nested `reasoning` params — the compat adapter sends a malformed mix and OpenAI rejects with "Unknown parameter." Using `@ai-sdk/openai` directly fixes this. Same logic for Anthropic and Google: native SDKs handle their respective quirks.

**Model name format:** OpenCode sends the **key** (not the `name` field) to the upstream API. Per-provider endpoints accept bare model names (`gpt-5`, `claude-sonnet-4-5`). The compat endpoint requires provider-prefixed names (`openai/gpt-5`, `anthropic/claude-sonnet-4-5`). Our config uses per-provider endpoints with bare keys throughout.

## Authentication

All gateway-routed traffic uses the same pattern:

```
Authorization: Bearer ${CF_AIG_TOKEN}
```

The gateway recognizes this as its own auth, strips it before forwarding upstream, and substitutes the stored provider API key (BYOK). No provider keys live client-side.

Importantly, do **not** send a `cf-aig-authorization` header in addition to `Authorization` — the gateway forwards the unknown one to the upstream as a provider auth header, which Anthropic and OpenAI then reject. Just send one Authorization header with the gateway token.

## Per-user / per-project attribution

The example config attaches a `cf-aig-metadata` header to every gateway-routed request:

```json
"options": {
  "headers": {
    "cf-aig-metadata": "{\"app\":\"{env:OPENCODE_APP_TAG}\",\"user\":\"{env:OPENCODE_USER_TAG}\"}"
  }
}
```

Two env vars drive it:

- **`OPENCODE_USER_TAG`** — set once in your user environment (e.g. to your OS username, your initials, your email handle). Persistent.
- **`OPENCODE_APP_TAG`** — auto-updated by a native shell directory-change hook that **walks up to the nearest `.git`** and uses that directory's basename. So `~/code/auth-api/src/components` still tags as `auth-api`, not `components`. No wrapper around the `opencode` command, no prompt redefinition. PowerShell uses `LocationChangedAction`; bash uses `PROMPT_COMMAND`; zsh uses `chpwd`. Once opencode launches, the value is captured into its process env and stays fixed for the session.

In the CF AI Gateway dashboard, this surfaces as filterable metadata: pick a user to see their burn rate, pick an app to see how much was spent on each project, or filter on both at once.

See [SETUP.md](SETUP.md#7-optional-but-recommended-automatic-per-user-and-per-project-attribution) for the one-line directory-change hook that makes the app tag automatic.

### Why git-root basename and not full git remote slug

We walk up to `.git` and use that directory's name. Pure filesystem checks, no `git` subprocess on every `cd`. Works for normal repos, submodules, and worktrees.

Limitations:
- Two unrelated directories both named `auth-api` would share a tag — fine for solo dev, fuzzy for org-scale analytics
- Directories without a `.git` ancestor fall back to current basename — noisy for `~`/`/tmp` work but not catastrophic

If org-scale attribution ever matters, the next step would be a hook or plugin that records a git remote slug such as `myorg/auth-api` instead of just the local directory name.

## OpenCode extension points

Beyond the tier+gateway core, OpenCode supports four distinct extension mechanisms. Each solves a different problem; knowing which to reach for matters more than knowing every available plugin.

| Mechanism | What it adds | Covered in this repo |
|---|---|---|
| **MCP servers** | External tools (docs lookup, security scans, browser automation, etc.) | [MCP-INTEGRATION.md](MCP-INTEGRATION.md) |
| **Plugins / skills** | Process discipline + custom skill packs, loaded via `opencode plugin <module>` or `"plugin"` field in `opencode.json` | [SUPERPOWERS-INTEGRATION.md](SUPERPOWERS-INTEGRATION.md) |
| **LSPs** | Structured code Q&A — definition / references / hover / diagnostics | [LSP-INTEGRATION.md](LSP-INTEGRATION.md) |
| **Hooks** | `pre-tool-use`, `post-tool-use`, `session-start`, etc. fired by OpenCode at well-defined moments. Useful for cost tracking, audit logging, security gates, blocking edits to specific paths. | Mentioned here as an extension point; not part of the shipped setup |

Two specific additions worth knowing beyond the integrations we ship by default:

- **[Cloudflare Skills](https://github.com/cloudflare/skills)** — `npx -y skills add cloudflare/skills --skill '*' --yes --global`. Official skill pack from Cloudflare for working on Workers / Pages / AI / D1 / R2. Since this repo already routes through CF AI Gateway, anyone building on the platform beyond just routing tokens through it gets the same structured-doctrine benefit superpowers provides, scoped to CF.
- **Hooks as a power user tool.** OpenCode's hooks are underused but powerful — they fire deterministically at lifecycle points and can modify or block agent behavior in code, not natural language. Worth knowing exists even if you don't use them right away.

The plugin ecosystem is still young. Most extension value today flows through MCPs and skills; the rest is per-team customization via hooks. As the ecosystem matures we may promote this section to a dedicated doc.

## Shipped orchestrator

The shipped setup is a centralized, hierarchical orchestration pattern. The `build` primary agent is the orchestrator: it owns decomposition, task assignment, dependency sequencing, final verification, fallback decisions, and the user-facing answer. The project-local subagents are specialized workers with narrow scopes; they do not decide whether the overall user request is complete.

The shipped example config now uses the primary `build` agent as a frontier-tier orchestrator. It can dispatch concrete subtasks through OpenCode's native Task tool to project-local subagents under `.opencode/agents/`:

- `searcher` subagent — cheap hosted search/LSP/grep worker
- `reader` subagent — cheap hosted file-reading and extraction worker
- `coder` subagent — cheap hosted implementation worker (`gpt-5-mini`)
- `planner` subagent — cheap hosted decomposition and planning worker
- `build` primary agent — frontier reasoning, dispatch, synthesis, and final review

Every subagent handoff should include the objective, relevant file paths and constraints, scope boundaries, expected output format, and success criteria. This keeps context transfer explicit and prevents vague worker results from becoming hidden assumptions.

The fault-tolerance rule is deliberately simple: retry a worker once only when the failure is likely missing context, then escalate to the primary agent or a more capable path. The benchmark harness records when routing does not happen or when a worker model is absent, so cost-saving claims have to be backed by actual model evidence.

This stays an OpenCode-native config change — no external service. The practical adjustment from the original design is reliability-first routing: the shipped subagents use cheap hosted models rather than the optional local tier, and the implementation worker is stronger than the read/search workers. The manual `local` primary agent still exists for read-only local work when your hardware makes that practical.

Superpowers skills are available in the current setup. They add process discipline — TDD, brainstorming, code review, plan-then-execute workflows — while the orchestrator still decides what concrete work to dispatch to cheaper subagents.

LSP integration is native in OpenCode — see [LSP-INTEGRATION.md](LSP-INTEGRATION.md) for the how-to. Enabled via `"lsp": {}` in `opencode.json`; the example config does this by default.
