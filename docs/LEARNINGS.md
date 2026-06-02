# Learnings — gotchas captured while building this

Every entry below cost real debugging time. Captured here so the next person doesn't relearn them.

## Fair token comparisons require successful outputs, not just matching prompts

The June 2026 benchmark pass made this painfully concrete. The goal was simple on paper:
run the same one-shot project prompts through Claude Code, Codex CLI, and OpenCode, then
compare token/cost usage for quality outputs. In practice, getting all three agents to
produce comparable successful artifacts took days.

The hard part was not the `tic-tac-toe` app. It was operational consistency:

- agent CLIs inherit different plugin/config state;
- MCP helpers can spawn unexpected child processes on Windows;
- one tool may pause for a workflow skill while another runs unattended;
- the same prompt can produce a broken artifact on one attempt and a 10/10 artifact on a rerun;
- judge bugs can create false negatives if UI text formats differ, such as score labels like `X: 1`.

The publishable result should therefore be framed as selected successful artifacts under the
same specs and deterministic judges, not as proof that one uninterrupted all-tool batch is easy
to reproduce. That caveat is part of the benchmark result.

## OpenCode sends the model **key**, not the `name` field

In OpenCode's provider config:

```json
"provider": {
  "foo": {
    "models": {
      "the-key": { "name": "the-name" }
    }
  }
}
```

The model field in the actual HTTP request to the upstream API is **`the-key`**, not `the-name`. The `name` field appears to be display-only (or unreliable for routing — behavior may vary by adapter version).

**Practical implication:** make the key exactly match whatever the upstream expects on the wire.

- **Ollama:** key must equal the Ollama model tag exactly, with colon — `qwen2.5-coder:7b-instruct-q4_K_M`, not `qwen2.5-coder-7b`. Verified by `ollama list`.
- **CF Gateway `/compat` endpoint:** key must include the provider prefix — `anthropic/claude-haiku-4-5`, not `claude-haiku-4-5`. Without prefix, returns HTTP 400 with `code 2019`.
- **CF Gateway per-provider endpoints** (`/anthropic`, `/openai`, `/google-ai-studio`, `/workers-ai`): key uses bare upstream name — `claude-haiku-4-5`, `gpt-5`, `gemini-2.5-pro`, `@cf/qwen/qwen2.5-coder-32b-instruct`.

## OpenCode + OpenAI reasoning models is broken on `@ai-sdk/openai-compatible`

When using `@ai-sdk/openai-compatible` to talk to gpt-5 / gpt-5-mini / o-series, the captured request body contains a malformed combination:

```json
{
  "model": "gpt-5-mini",
  "max_tokens": 32000,           // ← should be max_completion_tokens
  "reasoningSummary": "auto",    // ← camelCase, rejected as unknown parameter
  "reasoning_effort": "medium"   // ← snake_case, accepted
}
```

OpenAI returns `400 Unknown parameter: 'reasoningSummary'`.

**Fix:** use `@ai-sdk/openai` (not openai-compatible) for OpenAI traffic. The proper SDK handles the reasoning-model conventions correctly — emits `max_completion_tokens`, no spurious `reasoningSummary`.

In the example config: `openai-via-gateway` provider uses `npm: "@ai-sdk/openai"` pointed at the gateway's `/openai` per-provider endpoint.

## CF AI Gateway error code reference

| Code | Meaning | Likely cause |
|---|---|---|
| `2001` | "Please configure AI Gateway in the Cloudflare dashboard" | Gateway slug doesn't exist, OR slug exists but has no BYOK keys stored for the upstream you're hitting |
| `2019` | "Chat completion bad format" | Request body shape doesn't match what the endpoint expects. Most commonly: model field missing provider prefix on the `/compat` endpoint |

Many other gateway errors pass through the upstream's response verbatim — those are diagnosable as the upstream's own error (Anthropic, OpenAI, Google).

## Authentication: send ONE header, not two

The CF AI Gateway recognizes `Authorization: Bearer <CF_AIG_TOKEN>` as its own auth and substitutes the BYOK-stored provider key before forwarding upstream.

**Do not** also send a `cf-aig-authorization: Bearer <CF_AIG_TOKEN>` header. If you send both, the gateway forwards `Authorization` upstream verbatim — and Anthropic/OpenAI will reject the gateway token as an invalid provider key.

This bit us specifically when an early config tried to use `cf-aig-authorization` (assuming it was the right header) alongside the SDK-emitted `Authorization`. Symptom: clean 401 from the upstream provider, not from the gateway.

## Small coder models fumble OpenAI-style tool calling

We tested `qwen2.5-coder:7b-instruct-q4_K_M` directly against Ollama with a `write` tool exposed. Expected behavior: model emits `tool_calls` in the response. Actual:

```json
"content": "```json\n{\n  \"name\": \"write\",\n  \"arguments\": {...}\n}\n```",
"tool_calls": null
```

It put the tool call in the *content* field as a code block instead of using the `tool_calls` field. Unparseable by any client following the OpenAI function-calling spec.

Same probe against `granite4:7b-a1b-h`:

```json
"content": "",
"tool_calls": [{ "id": "call_xyz", "type": "function", "function": {"name": "write", "arguments": "{...}"} }],
"finish_reason": "tool_calls"
```

Granite4 emits correct OpenAI-format tool calls. The example config uses Granite4 for the local tier specifically because of this.

**Generalization:** if you're using a non-frontier model in an agent loop, probe it directly first. Don't assume "supports tools" means "uses the correct response format."

## Tool restriction at the agent level

OpenCode's agent config supports a `tools: {<name>: <bool>}` field that disables specific tools per-agent. The schema marks it as `@deprecated` in favor of `permission`, but it still works at the time of writing. The newer `permission` field exposes tools to the model but denies execution — which is **not** what you want for a small model that fumbles tool calls. You want the tool to never appear in the model's awareness at all.

So in the example config, the `local` agent uses the `tools` field to fully strip write/edit/bash/etc. from what the local model can see:

```json
"local": {
  "model": "ollama/granite4:7b-a1b-h",
  "tools": {
    "write": false,
    "edit": false,
    "bash": false,
    "task": false,
    "webfetch": false,
    "websearch": false,
    "todowrite": false
  }
}
```

Even with Granite4 (which handles tools correctly), restricting the local tier to read-only matches its intended use (search, summarize) and avoids ambiguous prompts.

## `opencode run` is hard to drive from non-TTY harnesses

`opencode run --agent X "prompt"` works perfectly in an interactive terminal but hangs or buffers output forever when run through PowerShell pipelines, Claude Code's Bash tool, or subprocess wrappers. The root cause appears to be stdin/TTY detection inside opencode.

If you're scripting against opencode (e.g., for CI smoke tests or batch evaluation), prefer hitting the gateway HTTP endpoints directly rather than going through `opencode run`. The verification script in this repo follows that pattern — it doesn't use opencode at all, just curls the configured endpoints.

## CF "BYOK" means stored keys, not pass-through

CF's documentation uses "BYOK" to mean **keys stored gateway-side**. Once configured, clients don't need provider keys — only the gateway token. This is the opposite of what "BYOK" usually means in other ecosystems (where it means "bring your own key with each request").

If you see `code 2001` despite your gateway being authenticated, the most likely cause is no BYOK keys are actually stored for the upstream you're trying to reach. Dashboard → AI Gateway → your gateway → Providers tab (or "Stored Keys") → check each provider you need.

## Getting LSP working in OpenCode takes three things, none documented at opencode.ai/docs/lsp/

This is the deepest rabbit hole in this entire stack. Captured here so the next person doesn't burn an afternoon repeating it. In OpenCode 1.15.5, the agent-callable `lsp` tool requires **all three** of the following:

### 1. `OPENCODE_EXPERIMENTAL_LSP_TOOL=true` env var (the actual gate)

The `lsp` tool is gated behind an experimental runtime flag in `packages/opencode/src/tool/registry.ts`:

```typescript
...(flags.experimentalLspTool ? [tool.lsp] : []),
```

Without this env var, the tool **isn't loaded into the registry**. Config tweaks at the agent level can't fix it because there's no tool to grant permission for. Set persistently:

```powershell
[Environment]::SetEnvironmentVariable("OPENCODE_EXPERIMENTAL_LSP_TOOL", "true", "User")
```

**Critical**: user-scope env vars require **new process trees**. After setting on Windows, fully close all terminal windows (not just tabs — the whole Terminal app) and reopen. Verify with `$env:OPENCODE_EXPERIMENTAL_LSP_TOOL` in the fresh shell before launching opencode.

### 2. Per-agent `tools: { lsp: true }` (and ideally `permission: { lsp: "allow" }`)

Even with the flag, the tool needs to be in the agent's allowed toolset. Add to `opencode.json` for every code-touching agent (build, oss, frontier, local read-only).

### 3. A prompt nudge biasing toward LSP

Without explicit guidance, models default to grep for code-symbol questions. Add a `prompt` field on each agent telling the model to prefer the lsp tool — including the gotcha that `filePath` for `workspaceSymbol` must be an **existing file with the right language extension** (not a directory). See [LSP-INTEGRATION.md](LSP-INTEGRATION.md) for the exact prompt text.

### What goes wrong without each piece

| Missing | Symptom |
|---|---|
| Env var | Model says "I don't have the LSP tool available." Tool literally not in toolset. |
| Per-agent tools/permission | Tool may be registered but agent can't see it. |
| Prompt nudge | Tool available, agent ignores it. Defaults to grep. |
| All three present | LSP works as advertised. |

### Diagnostic checklist when LSP isn't firing

1. Did you set the env var **and** open a fresh terminal afterward?
2. Does `tool.registry status=started lsp` appear in `opencode --print-logs --log-level DEBUG` output?
3. Does any **invoked skill** override your prompt nudge? Skills load specific recipes that often say "grep" — a strong agent prompt may lose to a skill's explicit instructions. If your test prompt triggers a skill that uses grep, that's why.
4. Does the model call `lsp.workspaceSymbol` with a real file path (not a directory)?

### Bonus: opencode's `opencode run` non-interactive mode auto-rejects permission prompts

Useful for understanding test failures vs. real TUI behavior: `opencode run` is non-interactive — when a tool requires `external_directory` permission (any path outside cwd), opencode **auto-rejects** rather than asking. The tool call fails. In real TUI use you'd just click "approve" and it'd work.

Means `opencode run` is a poor proxy for actual TUI behavior when testing permission-gated workflows.

## OpenCode TUI model picker hides most configured models by default

If you configure 17 models across 5 providers and the picker shows you 6, you're hitting this. The CLI (`opencode models`) shows everything; the picker's default view applies a hidden filter.

**What the filter does** (from `packages/app/src/context/models.tsx`, function `visible`):

A model is **shown in the default view** only if at least one of:
1. You've previously selected it (visibility flipped to `"show"` automatically on `model.set(... { recent: true })`)
2. It's the **newest-by-`release_date`** in its `family` within its `provider`, **within the last 6 months**
3. It has no valid `release_date` in opencode's metadata catalog

Otherwise hidden.

`release_date` and `family` come from the models.dev catalog. Net effect: most user-configured models are silently filtered out because they're not "latest in family." Across launches the visible subset can drift as models.dev updates.

**Workarounds** (all always work, regardless of picker default state):

```bash
# Type the model name (or substring) into the picker search box.
# Hidden models surface, and selecting one auto-promotes it permanently.

# Or address by full key on the CLI:
opencode run --model anthropic-via-gateway/claude-sonnet-4-5 "..."
opencode --model anthropic-via-gateway/claude-sonnet-4-5     # boot TUI pre-selected

# Or once inside the TUI:
/model anthropic-via-gateway/claude-sonnet-4-5
```

Once you select a hidden model via any of these paths, it gets auto-flipped to `visibility: "show"` and stays in the picker default view going forward. So a one-time per-model click does promote them into the visible set permanently.

Reproduced on opencode 1.15.5 with this repo's config. Filed upstream as [anomalyco/opencode#28484](https://github.com/anomalyco/opencode/issues/28484).

## Per-provider endpoints handle bare model names; compat endpoint requires prefixes

Verified via curl:

| Endpoint pattern | Model field format |
|---|---|
| `/v1/{acct}/{gw}/compat/chat/completions` | `anthropic/claude-sonnet-4-5`, `openai/gpt-5`, `workers-ai/@cf/...` |
| `/v1/{acct}/{gw}/anthropic/v1/messages` | `claude-sonnet-4-5` |
| `/v1/{acct}/{gw}/openai/chat/completions` | `gpt-5` |
| `/v1/{acct}/{gw}/google-ai-studio/v1beta/openai/chat/completions` | `gemini-2.5-pro` |
| `/v1/{acct}/{gw}/workers-ai/v1/chat/completions` | `@cf/qwen/qwen2.5-coder-32b-instruct` |

We use the per-provider endpoints throughout because the proper SDKs (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) target them natively.

## `codex-mini` is restricted

OpenAI's `codex-mini` model is listed in Cloudflare's gateway-supported models page but returns `model_not_found` when probed from a standard OpenAI account. Appears to be tier-gated or in restricted access. Don't add it to your config unless you've verified your account has access.

## Workers AI model catalog breadth is larger than the OpenCode-compatible subset

(Added 2026-05-27.) A model being listed in Cloudflare's AI / Workers AI catalog does **not** mean it is automatically viable inside the current OpenCode + `@ai-sdk/openai-compatible` + AI Gateway worker stack.

Empirical results from a targeted reliability pass:

- **`@cf/zai-org/glm-4.7-flash`** -- worked for read, glob, and harmless write/read-back tasks through `opencode run`
- **`@cf/openai/gpt-oss-20b`** -- failed with Workers AI `Bad input` request-shape errors
- **`@cf/qwen/qwen3-30b-a3b-fp8`** -- failed with Workers AI `Bad input` request-shape errors
- **`@cf/qwen/qwen2.5-coder-32b-instruct`** -- also failed with the same request-shape errors in the current stack, despite being the previously-shipped OSS default

The failure signature was the same class of error: Workers AI rejected the request body with `oneOf at '/' not met` / content-shape mismatches. This points to an adapter compatibility issue in the current stack rather than a pure model-quality issue.

**Practical rule**: choose OSS defaults based on **runtime compatibility inside OpenCode**, not just on benchmark reputation or catalog presence. As of 2026-05-27, `glm-4.7-flash` is the safest hosted-OSS default for cheap mechanical worker roles in this repo.

## Cheap coder models can be false economy

(Added 2026-05-28.) The first serious architecture-mode rerun after subagents were working moved implementation work to `@cf/zai-org/glm-4.7-flash`. This proved routing, but not reliability.

What happened:

- The run used both `gpt-5` and GLM, so architecture-mode delegation fired.
- The output files existed, so a shallow harness would have counted it as success.
- The deterministic browser judge caught broken markdown rendering, unsafe XSS behavior, and command-line tests that did not prove the browser output.
- The CLI also timed out before the orchestrator completed final integration.

The lesson is not "GLM is bad." GLM remains useful for read/search/planning when the primary gives narrow scope. The lesson is that **implementation is a different capability tier**. A model can be cheap, route correctly, and still be the wrong worker for code generation with security-sensitive browser behavior.

The fix was to move only the `coder` subagent to `openai-via-gateway/gpt-5-mini` while leaving `searcher`, `reader`, and `planner` on GLM. In the next markdown-editor run, OpenCode used `gpt-5` + `gpt-5-mini`, completed in about 4.5 minutes, passed the command-line tests, blocked XSS, and stayed far below the cost of direct frontier-tool runs.

**Practical rule**: optimize by role, not by global model price.

| Work type | Current default | Why |
|---|---|---|
| Search/read/extract | GLM 4.7 Flash | Cheap and reliable enough for bounded factual work |
| Implement/test/docs | GPT-5 mini | Much better reliability while still cheaper than frontier-direct |
| Architecture/fallback/final review | GPT-5 | Judgment and accountability stay with the orchestrator |

This is the core correction to the early project direction. The goal is not "move to a less expensive model." The goal is "spend frontier tokens only where they buy reliability."

## Reasoning models burn output tokens you can't see in the response

When testing gpt-5 with `max_completion_tokens: 30` and a short prompt, the response came back with **empty content** but `reasoning_tokens: 64`. The model used its entire output budget on internal reasoning before producing user-facing text. For real testing, set `max_completion_tokens` to at least 256.

## Gateway adds latency you'll feel

Direct provider → ~500ms typical first-token. Gateway-routed → ~600–800ms typical first-token. Not catastrophic for agent loops but noticeable in interactive chat. Worth factoring in if latency-critical realtime work is your use case.

## ccusage's `inputTokens` is the uncached delta, not what the model actually saw

When comparing cost across tools, the raw `inputTokens` field in ccusage output is misleading. It reports only the tokens that were NOT served from cache -- so a tool with aggressive caching shows a very low `inputTokens` even though it sent a massive context. Claude's 69K vs Codex's 107K inputs in raw session records is not a real difference in what each model processed.

The honest figure is **Effective Input**: `inputTokens + cacheReadTokens + cacheWriteTokens`. That's what the model actually saw, regardless of where tokens came from. Field names vary by tool -- claude uses `cacheReadTokens`, codex uses `cachedInputTokens`, opencode uses `cacheReadTokens`. The bench script normalizes this via alias lists so the computed delta uses the right field for each tool.

## Re-running `bench-run.ps1 -Phase finish` would contaminate the diff

The finish phase computes a delta by comparing ccusage snapshots before and after the benchmark run. If you re-captured the "after" snapshot a second time -- after using any of the tools for unrelated work -- those sessions would appear in the delta and inflate cost/token figures. Two mitigations are in place: (1) the script caches `_ccusage-after.json` on the first finish call and reuses it on subsequent calls rather than re-capturing; (2) sessions are filtered by a timestamp window derived from the newest agent-output file's mtime plus a 5-minute buffer, so unrelated tool use that happened before or after the benchmark window is excluded.

## Playwright `click()` waits for `disabled` to clear before clicking

Both claude and codex produced implementations that set `disabled` on occupied cells and on all cells after the game ends -- good defensive coding. The R4 draw-sequence test couldn't simply click cells and expect them to succeed: occupied cells block on `disabled`. The test had to call `isDisabled()` first and treat that as confirmation the cell was correctly blocked, rather than attempting a click that would timeout. This is a pattern worth building into any selector-agnostic Playwright helper that tests interactive board games.

## `$repoRoot = Resolve-Path "..\.."`, not `".."`

Scripts under `benchmarks/scripts/` need two parent jumps to reach the repo root -- the script lives two levels down, not one. An off-by-one in an early version produced doubled path segments (`benchmarks/benchmarks/...`) that silently created wrong directories instead of failing loudly. Always resolve relative paths explicitly and verify the target before any `New-Item` or `Copy-Item` calls.

## Local LLM tool-calling with opencode is real, hard, and runtime-sensitive

(Added 2026-05-26.) Trying to make the `local` tier dispatch actually fire to a local Ollama/LM Studio model burned ~4 hours. Multiple distinct failure modes, all with the same surface symptom: the build agent dispatched correctly, but the local subagent returned zero tool calls or hallucinated output. Documented here so the next person doesn't have to rediscover this.

### Failure modes we hit, in order

1. **Granite4 7B (Ollama)** -- silent. Zero output, zero tool calls. Couldn't even diagnose without studying the dev log -- the model produced nothing usable but the trace just showed "0 toolcalls."
2. **Qwen2.5-coder 7B q4_K_M (Ollama)** -- attempted tool calls but emitted malformed tags. The Qwen team's own statement on [ollama#6007](https://github.com/ollama/ollama/issues/6007) calls this out as expected behavior for small + heavily quantized models: "the smaller models, especially after quantization, don't always follow instructions as accurately. I found that the tags were often missing in the generated text."
3. **gpt-oss 20B (Ollama)** -- emitted OpenAI's Response API tokens (`<|channel|>analysis`, `assistant<|channel|>functions.X`) instead of standard OpenAI JSON tool calls. opencode's parser misread these as unknown tool names. Ollama's template handling does not normalize gpt-oss's native format.
4. **Qwen3-coder 30B (Ollama)** -- emitted XML-tag tool calls (`<function=read>...</function>`) instead of JSON. opencode partially understood the first call but got distracted on subsequent turns by the giant list of MCP tools (40+ tools flooding the subagent's context). Switched to migrating Cloudflare Pages to Workers instead of counting lines.
5. **gpt-oss 20B (LM Studio)** -- still wrong protocol despite LM Studio's better templates. gpt-oss is hardwired to emit Response API tokens; that's not a runtime-fixable issue, it's the model's training.
6. **Qwen3-coder 30B (LM Studio) at default n_ctx 4096** -- failed similarly to Ollama: context overflow truncated the tool definitions, model lost track of what tools were available.
7. **Qwen3-coder 30B (LM Studio) at n_ctx 16384, with `tools: true`** -- WORKED. Tool call fired, file read succeeded, correct line count returned.

### The actual working recipe

Confirmed working:

| Component | Setting |
|---|---|
| Runtime | **LM Studio** (NOT Ollama -- opencode maintainer explicitly recommends LMStudio: "ollama has been unreliable and we receive a large number of issues from people trying to use it") |
| Model | **qwen3-coder** (NOT qwen2.5; NOT granite; NOT gpt-oss; designed specifically for agentic tools) |
| `n_ctx` | **16384 or higher** (the LM Studio default of 4096 is too small for opencode's prompts + tool defs + MCP tool list + user message often 8k+ tokens -- truncation kills tool-calling) |
| opencode config | Model-definition needs `"tools": true` |
| GPU offload | All layers if VRAM allows; CPU fallback is too slow to be usable |

Reference: https://github.com/p-lemonish/ollama-x-opencode -- the recipe that solved this for many users on opencode#1034.

### Performance honesty

Even with the working setup, qwen3-coder 30B Q4 at n_ctx 16384 on consumer GPUs takes **20-40+ seconds per dispatched subtask**. For tier-routing to dispatch reads and grep to local while the orchestrator stays on a frontier model, this means: every routed lookup costs you 30+ seconds of latency for a sub-call that gpt-5 would have done in 2-3 seconds. For a real coding session that dispatches dozens of subtasks, the wall-clock cost adds up faster than the dollar savings. **Practical reality: local-tier dispatching is only worth it if (a) you have a 24GB+ VRAM GPU running flat-out, AND (b) you value cost optimization over wall-clock time.**

### The pivot we considered

If your hardware doesn't support practical local inference, the architectural thesis ("dispatch cheap work to cheap models") can still be tested with gateway-hosted cheap models. Earlier options included `openai-via-gateway/gpt-4o-mini` and `workers-ai-via-gateway/@cf/qwen/qwen2.5-coder-32b-instruct`, both of which avoid the local runtime/tool-call failure modes.

The later benchmark evidence narrowed that idea: hosted cheap models are useful, but not all roles are safe to cheap out. GLM 4.7 Flash is now retained for search/read/planning. Implementation moved to `gpt-5-mini` after GLM failed the markdown-editor target. The local agent remains a manual experiment, not the recommended daily path.

### Generalizable lesson

Three orthogonal failure axes when running local LLMs as opencode subagents:
1. **Model output format** must match what opencode (via the @ai-sdk/openai-compatible provider) can parse: standard OpenAI JSON tool-call format. XML-tag formats (qwen3-native), Response-API tokens (gpt-oss-native), or malformed JSON (quantized models) all silently fail.
2. **Context window** must be large enough for opencode's prompt overhead (system prompt + tool defs + MCP tool list + user message often 8k+ tokens). Default `n_ctx=4096` on most Ollama/LMStudio loads is insufficient.
3. **Runtime templates** matter: Ollama's are coarse and break for many models; LM Studio's per-model handling is more reliable. Use LMStudio for local subagent work until Ollama improves.

When ALL three are aligned, local tool-calling works. Miss any one and you'll spend hours diagnosing it.

## PowerShell auto-unwraps single-element arrays from function returns

A `Get-Field` helper returning `@("claude-opus-4-7")` (a one-element array) gets unwrapped by PowerShell to a bare string at the call site. Code that checked for `IEnumerable` shape to detect multi-value fields would miss the single-model case. Check both shapes -- scalar and array -- when consuming function output that might return either depending on data.

## Codex CLI mis-reports its model name in session records

Codex CLI writes `"gpt-5.5"` as the model name in its session logs. The actual model is GPT-5. ccusage propagates this name as-is. This is cosmetic -- the token counts and costs appear correct -- but any code that branches on model name for cost lookup or display will get the wrong value. Worth filing upstream. In the meantime, note the discrepancy in any cost analysis that cites Codex session data.

## Codex session-transcript auto-copy is a data-leak hazard

An earlier version of `bench-run.ps1` did a "best-effort" copy of Codex session transcripts at finish: any file under `~/.codex/sessions/` whose `LastWriteTime` was after the benchmark's start time got pulled into the run's results directory. The intent was helpful -- capture the actual transcript so it can be reviewed alongside the metrics. The reality was painful: Codex stores ALL sessions in one global directory (not scoped by project), and ccusage's own indexing process bumps mtimes on unrelated old sessions whenever it reads them. The mtime filter ended up matching session files from work that had nothing to do with the benchmark -- including internal infrastructure discussions and other context that absolutely doesn't belong in a public OSS repo.

Caught this during a pre-push secret sweep before the initial commit went to the public remote. A 2.4 MB unrelated Codex transcript from an earlier deployment-skill session had been committed alongside the benchmark.

**Fix**: codex transcript auto-copy is now disabled in `bench-run.ps1` (commented out, preserved for reference). `**/_session-transcript/` is in `.gitignore` as a belt-and-suspenders catch. If you need a specific Codex session captured, copy it manually after the run by inspecting `~/.codex/sessions/` and picking the file whose embedded timestamp matches the benchmark window.

Claude's session storage is per-encoded-project-dir so its transcript copy stays scoped correctly. OpenCode's is in a SQLite DB and requires manual `opencode export <session-id>`, which sidesteps the issue.

**Lesson generalized**: any "copy whatever's recent" heuristic that reads from a global directory is one indexer mtime-bump away from leaking unrelated data. When in doubt, require explicit identifiers (session IDs, project paths) over time-based heuristics.

## OpenCode's cost win comes paired with a discipline gap that prompt nudges can close

First markdown-editor benchmark run surfaced a real pattern. OpenCode (gpt-5 via this gateway) produced functionally correct app logic -- same parser correctness, same XSS handling, same R1-R8 PASS as claude (opus 4.7) and codex (gpt-5 direct). But it scored 2.6 / 5 on the qualitative dimensions vs 4.4 / 4.6 for the frontier-direct tools. The gap was almost entirely about deliverable discipline rather than coding capability:

- Tests were placed at `output/tests/markdown.test.js` instead of `output/markdown.test.js` -- the prompt asked for "a test file you can run with `node --test`" which we interpret as a single file at root. OpenCode's nesting cost it R9 and R10 even though the tests themselves were well-formed and would have passed if invoked from the right path.
- `README.md` was a single line (`# Self-contained Markdown Editor`) despite the SPEC asking for usage, test command, scope-in/out, and security model writeup. Both frontier tools wrote 50+ line READMEs covering all of that.
- Mobile responsive layout was skipped (no `@media` query, 1fr/1fr grid persists at narrow widths, content wraps mid-word). Both other tools handled it.
- `superpowers:verification-before-completion` was invoked per the prompt but evidently didn't actually run the tests -- the test-file-location issue would have been caught immediately by an `exit code != 0` from `node --test`.

This is a discipline gap, not a capability gap. The gpt-5 model that powers opencode's build agent demonstrably knows how to write a `@media` query and a thorough README -- it just elected not to. The frontier tools' equivalent quality scores reflect more diligent prompt-following, not different model knowledge of markdown rendering.

**Fix applied**: the build-agent prompt in `opencode.example.json` now includes explicit deliverable-discipline language up front: "Place files EXACTLY where specified... do NOT nest into subdirectories unless asked... READMEs MUST include sections on usage/test-command/scope/security-model... re-read the prompt's deliverable list before claiming complete... `superpowers:verification-before-completion` is non-negotiable on any prompt with named deliverables." Worth re-running the markdown-editor benchmark after this change to measure whether the gap closes -- if it does, the lesson is that cheap-tier models can match frontier-tier *on this kind of work* with the right agent-level scaffolding.

**Lesson generalized**: the tiered story isn't just "use cheap models for cheap work." It's "use cheap models with strong agent-level discipline for work that fits in their capability envelope." When a cheap model underperforms, audit whether it's a knowledge limit (real escalation needed) or a discipline limit (prompt fix sufficient) before assuming you need to spend more on inference.

## Concrete prompt rules land, abstract ones don't

Re-running the markdown-editor benchmark with the deliverable-discipline prompt fix surfaced something specific about how LLMs respond to prompt-level rules. The fix contained two distinct kinds of instruction:

1. **Concrete, mechanically-verifiable**: "Place files EXACTLY where specified -- do NOT nest into subdirectories. If the prompt says a test file you can run with `node --test`, it means a single file at the root, not a test directory."
2. **Abstract, content-quality**: "READMEs MUST include sections on usage, test command, scope, and security model. A one-line README is never sufficient."

The re-run measured them separately. Result:

- **Concrete rule LANDED.** opencode's tests went from `output/tests/markdown.test.js` to `output/markdown.test.js`. R9/R10 went from FAIL to PASS automatically. The agent followed the structural rule cleanly.
- **Abstract rule DID NOT LAND.** opencode's README this time was `# Self-contained Markdown Editor` -- byte-identical to the previous run. Same one-line README, same Documentation score of 1/5. The "MUST include sections X, Y, Z" instruction simply did not propagate to the agent's output.

The pattern: rules an LLM can comply with mechanically (place this file here, name it this) get followed. Rules that require the LLM to evaluate its own output ("is this README sufficient?") leave room for the model to declare "yes" with whatever it produced.

**The fix that follows from this**: replace the abstract README rule with a concrete template. Instead of "MUST include sections X, Y, Z," the prompt now says "Write README.md with EXACTLY these top-level headings, in this order: ## Usage / ## Running the tests / ## What is implemented / ## What is NOT implemented / ## Security model. Each section must have at least 3 sentences. A README under 30 lines is incomplete." The agent can now mechanically count sections and lines; there's no room to half-comply.

**Lesson generalized**: when an agent prompt isn't producing the output you want, check whether your rule is mechanically verifiable. "Be thorough" is wishful. "5 sections, 3 sentences each, 30 lines minimum" is enforceable. Make every quality instruction look like the second form.

## Frontier tools have meaningful run-to-run variance too -- not just cheap-tier

The same re-run also showed Claude (opus 4.7) regressing from 9/10 R1-R10 (run 0837) to 3/10 (run 0951) on the SAME prompt. R2-R8 all failed because the preview pane never updated when Playwright typed into the textarea -- claude wired the live-preview to an event that doesn't fire on programmatic `page.fill()` (likely `keydown` or `keypress` rather than `input`). The app probably works for a human typing letter-by-letter, but a Playwright test catches it as broken.

Two takeaways:
- Frontier tools are NOT immune to producing broken software. The Playwright deterministic layer is the only thing that catches this kind of regression -- a qualitative agent reading source might assume "well-structured HTML must work" and never notice.
- The cost-tier story doesn't just say "cheap models are good enough sometimes." It says "cheap models can be MORE reliable than frontier models on functional correctness when the cheap-tier setup is mature." opencode held 10/10 R1-R10 across both runs in this benchmark; claude went 9 -> 3. Codex held 10/10 too. The cheap-tier-via-gateway path was equal to or better than frontier-direct on this work.

## Self-verification has a hard ceiling without browser-control tools

Closely related to the run-to-run variance finding, but separate enough to name on its own. In the 0951 markdown-editor run, Claude ended its work with this caveat (paraphrased): "I cannot launch a browser from this CLI environment, so I did not visually confirm the file:// load. The evidence above (no external refs, valid HTML structure, syntactically valid scripts, parser proven by 50 tests against the exact code that ships in the file) is the strongest verification available without an interactive browser."

That caveat is intellectually honest -- and accurate. The parser tests DID pass. The HTML structure WAS valid. No external refs. By every verification path available to a CLI-bound coding agent, the work checked out. But the deterministic Playwright layer in our benchmark immediately found the integration bug: Claude wired the live-preview to an event that doesn't fire on Playwright's `page.fill()` (probably `keydown` or `keypress` rather than `input`). The parser worked. The HTML rendered. The textarea-to-parser wire was broken. Unit-testing a parser function in isolation cannot prove that the textarea-input-event invokes the parser; only an actual browser interaction can.

This is a hard ceiling on agent self-verification: an agent that can't drive a real browser has no path to verify HTML/JS integration. The proxy evidence it CAN gather (unit tests, structure inspection, lint clean) leaves the integration boundary unchecked. Even an agent that explicitly flags this limit -- as Claude did -- still produced broken software because the verification it actually performed didn't cover the failure mode.

**The fix is to give every agent browser control as a tool**, not just rely on benchmark-level Playwright as a safety net. [Microsoft's Playwright MCP](https://github.com/microsoft/playwright-mcp) exposes browser-automation as MCP tools (`browser_navigate`, `browser_type`, `browser_snapshot`, `browser_take_screenshot`, `browser_evaluate`). With this MCP wired into the agent, verification-before-completion goes from "trust the unit tests" to "load the file, type into the textarea, observe the preview." The exact bug Claude shipped here would be self-caught.

We've promoted Playwright MCP from "recommended optional" to the shipping default set in `opencode.example.json`. The token cost (a few hundred at startup for tool definitions) is paid back the first time the agent catches an integration bug instead of shipping it. This applies to every coding agent on every HTML/JS deliverable -- it's not opencode-specific.

**Lesson generalized**: when an agent operates in a constrained environment (no browser, no shell, no file write, etc.), the verification surface it CAN access is necessarily smaller than the failure surface it CAN ship. Honest agents flag this; even so, "honestly verified everything I could reach" still leaves real bugs in the gap. The fix is to expand the agent's reach via tools, not to expect it to compensate for the gap.

## Validate live config matches the repo template before drawing conclusions from runs

(Added 2026-05-26.) For four consecutive markdown-editor benchmark runs we iterated the opencode build-agent prompt in `opencode.example.json` -- adding a template-driven README rule (v3), an explicit 5-step Playwright MCP smoke-test (v4), and an executable Node docs-check (v6) -- then ran the benchmark, observed opencode still ship a 33-byte README, and concluded "the rule didn't land." This was measurement against the wrong config. The repo template (`opencode.example.json`) is just a starter file; the live config at `~/.config/opencode/opencode.json` is what opencode actually reads at startup. We had copied the repo template to the live location once, on initial setup, and never re-copied after subsequent edits. So the live `agent.build.prompt` was 1,471 characters of the original baseline rules while the repo template grew to 5,334 characters of iterated rules.

The discovery came after the fifth run when the user asked why opencode "kept ignoring the README rule." A direct hash comparison of the two `agent.build.prompt` strings showed they were completely different. After syncing the live config, the very next run (`2026-05-26-0829`) produced a 12,907-byte README and the docs-check rule passed on the first attempt -- the rule was fine, it just wasn't there.

The repo now ships a `Test-LiveConfigSync` preflight in `benchmarks/scripts/bench-run.ps1` that compares the live `agent.build.prompt` against the repo template at the start of every benchmark run. If they differ, it prints a yellow WARNING and prompts for confirmation before proceeding. Suppressible because intentional local divergence is a valid use case, but unmissable when it's accidental.

**Generalizable lesson**: any time you iterate a config that the running agent reads from a user-level location (`~/.config/...`, `~/.aws/...`, `~/.kube/...`), the iteration is invisible to the running process until the user-level copy is updated. Repo-template-only changes are inert until copied. Whenever your experiment depends on a config change being live, add a preflight that confirms the live config has the change you intend to measure.
