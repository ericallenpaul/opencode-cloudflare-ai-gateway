# Learnings — gotchas captured while building this

Every entry below cost real debugging time. Captured here so the next person doesn't relearn them.

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
