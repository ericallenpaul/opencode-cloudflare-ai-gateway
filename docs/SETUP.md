# Setup walkthrough

End-to-end setup, ~30 minutes if Cloudflare and Ollama are already in place. Most of that is "wait for `ollama pull`" and dashboard clicks. Tested on Windows 11 with PowerShell 7; the steps translate cleanly to macOS/Linux — the only Windows-specific bits are env var commands.

> **Shortcut**: at any point during this walkthrough -- and especially when you think you're done -- run `scripts/check-setup.ps1` (or `.sh`) to confirm every prerequisite is in place. It walks 9 required + 3 optional checks and prints exact fix commands for anything missing. Pass `-InstallConfig` (or `--install-config`) to also copy `opencode.example.json` into your opencode config dir with a backup of any existing file. The shipped orchestrator workers live under this repo's `.opencode/agents/`, so keep that folder with the project when using the orchestrator setup. See [`scripts/README.md`](../scripts/README.md) for details.

## Prerequisites

| Thing | How to check |
|---|---|
| **OpenCode CLI** (≥ 1.14) | `opencode --version` |
| **Ollama running** | `ollama list` returns something |
| **Cloudflare account** with AI Gateway available | Dashboard → AI → AI Gateway |
| **At least one provider API key** (Anthropic, OpenAI, Google) | You have one ready to paste |
| **PowerShell 7+** (Windows) or **bash 4+** with `jq` and `curl` (mac/linux) | For env vars and the verify script |

On macOS, `jq` is usually `brew install jq`. On Debian/Ubuntu, `apt install jq curl`. On Fedora/RHEL, `dnf install jq curl`. PowerShell on Windows already has the equivalent of curl built in (Invoke-RestMethod).

If OpenCode isn't installed:

```bash
npm install -g opencode-ai
```

If Ollama isn't installed: https://ollama.com/download

## 1. Pull the local-tier model

The local tier is optional and experimental. It defaults to `granite4:7b-a1b-h` (IBM Granite 4, MoE 7B/1B active, ~4.2 GB, designed for agentic tool use), but it is no longer the recommended daily-driver implementation path. The current balanced setup uses `gpt-5` for orchestration, `gpt-5-mini` for the `coder` subagent, and GLM 4.7 Flash for cheaper search/read/planning workers.

You only need to pull a local model if you want to try the manual `local` agent or continue local-tier experimentation.

```bash
ollama pull granite4:7b-a1b-h
```

Optional second pull for hybrid CPU+GPU work on larger sessions:

```bash
ollama pull qwen3-coder:30b
```

### Caveat: Ollama local-tier tool calling is unreliable

Through 2026-05 we observed that the local-tier `--agent local` dispatch fails for most Ollama models, including granite4, qwen2.5-coder, gpt-oss, and even qwen3-coder. The failure modes vary by model (silent, malformed tags, wrong protocol, format mismatch) but the result is the same: zero tool calls fire, the agent appears to do nothing. See [`LEARNINGS.md` -> "Local LLM tool-calling with opencode is real, hard, and runtime-sensitive"](LEARNINGS.md) for the full debug story.

The [opencode maintainer's recommended workaround](https://github.com/anomalyco/opencode/issues/1034#issuecomment-3233332990) is to use **LM Studio** instead of Ollama for local inference.

### Alternative: LM Studio for the local tier

LM Studio is hardware-agnostic, has more sophisticated per-model chat templates than Ollama (which normalizes tool-call formats across various model families), and exposes an OpenAI-compatible API on port 1234 by default.

Setup steps:

1. **Install LM Studio** from [lmstudio.ai](https://lmstudio.ai). Free for personal use; not open-source.
2. **Download `qwen3-coder-30b-a3b-instruct`** (or another Q4 variant of qwen3-coder that fits your VRAM). Inside LM Studio: search -> filter by "Tool use" capability -> download. ~18 GB for Q4_K_M.
3. **Bump the context length BEFORE loading.** In LM Studio Settings -> **Model Defaults**, change "Default Context Length" from "Model maximum" to "Custom value" = **16384** (or higher if VRAM allows). The default of 4096 is too small for opencode's prompt + tool definitions + MCP tool list and will silently break tool calling.
4. **Optionally relax Model Loading Guardrails** from "Strict" to "Balanced" if you want max context to actually be honored on tighter hardware.
5. **Load the model.** Confirm via the Developer Logs that the load line shows `n_ctx = 16384` (or whatever you set), NOT `n_ctx = 4096`.
6. **Start the local server** (Developer panel -> Local Server -> toggle Status: Running). Server listens on `http://127.0.0.1:1234` by default.
7. **Add the lmstudio provider to your opencode config** (already present in `opencode.example.json` as of v10). The relevant block:

```json
"lmstudio": {
    "name": "LM Studio (local)",
    "npm": "@ai-sdk/openai-compatible",
    "options": { "baseURL": "http://127.0.0.1:1234/v1" },
    "models": {
        "qwen3-coder-30b-a3b-instruct": {
            "name": "Qwen3 Coder 30B (LM Studio)",
            "tools": true
        }
    }
}
```

The `"tools": true` flag at the model-definition level is required -- without it opencode does not route tool-call traffic to the model correctly.

8. **Point the `local` agent at it:** in your `opencode.json`, set `agent.local.model` to `lmstudio/qwen3-coder-30b-a3b-instruct`.

### Performance reality

Even with this working setup, dispatched tool calls to qwen3-coder 30B Q4 at n_ctx 16384 take 20-40+ seconds each on consumer hardware (RTX 3090 / 4090 class with 24GB VRAM). For tier-routing to be a daily-driver win, expect: better cost than gateway-frontier models, but worse wall-clock time. If you don't have GPU horsepower to spare, see "Routing via gateway-hosted cheap models" below as an alternative that preserves the cost thesis without local-inference latency.

### Alternative: Route the local tier to a gateway-hosted cheap model

If local-inference latency is prohibitive but you still want the tier-routing cost benefit, point the `local` agent at a cheap gateway-hosted model instead:

```json
"agent": {
    "local": {
        "model": "openai-via-gateway/gpt-4o-mini"
    }
}
```

GPT-4o-mini is approximately **$0.15/M input tokens** vs gpt-5's **$1.25/M** -- about **8x cheaper per dispatched subtask** with reliable function-call execution (uses the same OpenAI JSON format opencode already handles for gpt-5). Wall-clock is also much faster than 30B-on-consumer-hardware. You lose the "free local" angle but gain practical day-to-day usability.

The tiered-cost-savings thesis ("dispatch cheap work to cheap models") still holds; the only thing that changes is where the cheap model runs.

## 2. Create a Cloudflare AI Gateway

1. Log into the Cloudflare dashboard.
2. Navigate to **AI** → **AI Gateway**.
3. Click **Create Gateway**. Pick a slug (you'll need this later — it becomes `CF_GATEWAY_NAME`).
4. In the new gateway's **Settings** → **Authenticated Gateway**, enable it and copy the generated token. You'll need this as `CF_AIG_TOKEN`.
5. In **Providers** (or "BYOK Stored Keys" depending on dashboard version), add the API key for each upstream you plan to use:
   - Anthropic — sk-ant-...
   - OpenAI — sk-...
   - Google AI Studio — AIza...
   - Workers AI usually doesn't need a key configured — Cloudflare provisions internally
6. Note your **Account ID** (top-right of dashboard, or under any worker URL). 32 hex characters. This becomes `CF_ACCOUNT_ID`.

## 3. Set the three required env vars

These are the *only* env vars the configuration depends on. No per-provider API keys live on your machine.

**Windows (PowerShell, user scope — persistent):**

```powershell
[Environment]::SetEnvironmentVariable("CF_ACCOUNT_ID",  "<your-32char-account-id>", "User")
[Environment]::SetEnvironmentVariable("CF_GATEWAY_NAME", "<your-gateway-slug>",      "User")
[Environment]::SetEnvironmentVariable("CF_AIG_TOKEN",    "<your-gateway-token>",     "User")

# Required for the LSP tool (experimental flag in opencode 1.15.5)
[Environment]::SetEnvironmentVariable("OPENCODE_EXPERIMENTAL_LSP_TOOL", "true", "User")
```

**macOS/Linux (bash/zsh — add to ~/.zshrc or ~/.bashrc):**

```bash
export CF_ACCOUNT_ID="<your-32char-account-id>"
export CF_GATEWAY_NAME="<your-gateway-slug>"
export CF_AIG_TOKEN="<your-gateway-token>"

# Required for the LSP tool (experimental flag in opencode 1.15.5)
export OPENCODE_EXPERIMENTAL_LSP_TOOL=true
```

> **About `OPENCODE_EXPERIMENTAL_LSP_TOOL`**: this is required for the agent-callable `lsp` tool (definition/references/hover/workspaceSymbol/etc.). Without it the LSP servers still run for *passive* diagnostics, but the model can't invoke LSP operations — it'll fall back to grep for every symbol lookup. See [LSP-INTEGRATION.md](LSP-INTEGRATION.md#required-setup-the-experimental-flag) for the full story.

**Then open a fresh terminal so the new env vars are picked up.**

Verify:

```powershell
$env:CF_ACCOUNT_ID, $env:CF_GATEWAY_NAME, $env:CF_AIG_TOKEN | ForEach-Object {
  if ($_) { "set ($($_.Length) chars)" } else { "MISSING" }
}
```

All three should report "set".

## 4. Drop in the config

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode" | Out-Null
Copy-Item .\opencode.example.json "$env:USERPROFILE\.config\opencode\opencode.json"
```

```bash
# macOS/Linux
mkdir -p ~/.config/opencode
cp ./opencode.example.json ~/.config/opencode/opencode.json
```

If you already have an opencode.json, **back it up first**: the example config wholesale replaces the `provider` and `agent` sections.

The repo also ships project-local subagents in `.opencode/agents/`. Those files are part of the working setup, not optional examples. If you transplant this configuration into another repository, copy that folder too or the primary `build` agent's Task-based orchestration will have nothing to call.

## 5. Verify everything is reachable

**Windows (PowerShell):**

```powershell
.\scripts\verify-models.ps1
```

**macOS / Linux (bash):**

```bash
chmod +x ./scripts/verify-models.sh
./scripts/verify-models.sh
```

Both scripts do the same thing: read your opencode.json, walk every model entry in every provider, send a tiny test request to each, and write two report files:

- `verify-models-<timestamp>.md` — human-readable summary
- `verify-models-<timestamp>.json` — machine-readable, feed to AI for help diagnosing any failures

Reports sanitize your account ID, gateway name, and gateway token before writing, so they're safe to paste into issues or chat for AI-assisted debugging.

A clean run reports `PASS` for every model. Any `FAIL` rows mean either the model isn't reachable from your gateway (BYOK key missing, model name typo, account tier restriction) or your env vars aren't set right.

## 6. First real run

```powershell
opencode run --agent local "say hi"
# optional/experimental: expect a clean natural-language greeting, no JSON

opencode run --agent oss "say hi"
# expect: a cheap hosted greeting via Workers AI / GLM

opencode run --agent frontier "say hi"
# expect: a clean greeting via gpt-5 (~3s including reasoning tokens)

opencode run --agent build "say hi"
# recommended default workflow: gpt-5 orchestrator with project-local subagents available
```

If `local` works but `oss` or `frontier` doesn't, the most common cause is a BYOK key not being stored on the gateway side. Check the gateway dashboard's Providers tab — the provider you're trying to use should show as connected.

For implementation work, prefer `--agent build`, not `--agent oss`. The `oss` manual override is useful for low-stakes direct cheap-model experiments, but the benchmark-backed path is the `build` orchestrator dispatching concrete implementation to the `coder` subagent (`gpt-5-mini`) and using GLM-backed workers for cheaper mechanical work.

## 7. (Recommended) Automatic per-user and per-project attribution

The example config attaches a `cf-aig-metadata` header to every gateway-routed request, tagging it with `app` (the directory you launched opencode from) and `user` (you). Both come from env vars: `OPENCODE_APP_TAG` and `OPENCODE_USER_TAG`. If neither is set, the header still works but values come through as empty strings — your gateway analytics won't be useful for slicing.

Two small bits of one-time setup make this automatic for every future opencode invocation:

**Set your user tag once (persistent):**

```powershell
# Windows
[Environment]::SetEnvironmentVariable("OPENCODE_USER_TAG", $env:USERNAME, "User")
```

```bash
# macOS / Linux — add to ~/.bashrc, ~/.zshrc, etc.
export OPENCODE_USER_TAG="$USER"
```

**Register a directory-change hook that walks up to the project root and sets the app tag.** This is a native shell mechanism — no wrapping of the `opencode` command, no prompt redefinition. The hook runs once when the shell loads to initialize `OPENCODE_APP_TAG`, then again on every `cd`. It walks up to find the nearest `.git` ancestor and uses that directory's name as the app tag. So whether you're in `~/code/auth-api` or `~/code/auth-api/src/components`, the tag stays `auth-api`.

Once opencode launches, the env var is captured into the opencode process and stays fixed for that session — even if you `cd` elsewhere in your terminal afterwards.

```powershell
# Windows — recommended: install the hook from this repo.
.\scripts\install-opencode-app-tag.ps1
```

That script adds a small managed block to `$PROFILE.CurrentUserAllHosts`, sets `OPENCODE_APP_TAG` for the current shell, and makes future PowerShell sessions keep it updated on each `cd`.

If you prefer to install it manually, the script writes this block:

```powershell
function Get-OpencodeAppTag {
    $p = $PWD.Path
    while ($p -and $p -ne (Split-Path $p -Parent)) {
        if (Test-Path -LiteralPath "$p\.git") { return Split-Path -Leaf $p }
        $p = Split-Path $p -Parent
    }
    return Split-Path -Leaf $PWD.Path
}
$ExecutionContext.SessionState.InvokeCommand.LocationChangedAction = {
    $env:OPENCODE_APP_TAG = Get-OpencodeAppTag
}
$env:OPENCODE_APP_TAG = Get-OpencodeAppTag
```

```bash
# bash — add to ~/.bashrc
_opencode_app_tag() {
    local dir="$PWD"
    while [[ "$dir" != "/" && -n "$dir" ]]; do
        if [[ -e "$dir/.git" ]]; then
            export OPENCODE_APP_TAG="$(basename "$dir")"
            return
        fi
        dir="$(dirname "$dir")"
    done
    export OPENCODE_APP_TAG="$(basename "$PWD")"
}
_opencode_app_tag   # set once for initial shell
PROMPT_COMMAND='_opencode_app_tag; '"$PROMPT_COMMAND"
```

```zsh
# zsh — add to ~/.zshrc
_opencode_app_tag() {
    local dir="$PWD"
    while [[ "$dir" != "/" && -n "$dir" ]]; do
        if [[ -e "$dir/.git" ]]; then
            export OPENCODE_APP_TAG="$(basename "$dir")"
            return
        fi
        dir="$(dirname "$dir")"
    done
    export OPENCODE_APP_TAG="$(basename "$PWD")"
}
_opencode_app_tag   # set once for initial shell
chpwd() { _opencode_app_tag }
```

After reloading your shell, `cd ~/code/auth-api/src/components` still sets `OPENCODE_APP_TAG=auth-api` because the hook walks up the tree until it hits the repo's `.git`. Outside any git repo, falls back to the current directory's basename (better than nothing for ad-hoc work).

### Verify the tags are reaching CF

Run a quick query in any directory, then go to the CF dashboard → AI Gateway → your gateway → Analytics. Filter by `metadata.app`. You should see the directory name show up. If you see empty values instead, your shell wrapper isn't being applied — confirm with `env | grep OPENCODE_` (Unix) or `$env:OPENCODE_APP_TAG` (PowerShell).

### Caveats

- **Config-load timing is what we want.** OpenCode resolves `{env:...}` substitutions when it starts, captures the values into its process environment, and never re-reads them. That means once opencode is running, even if you `cd` elsewhere in your terminal, the session keeps its original tag — which is what we want. Each opencode session = one project tag.
- **Outside a git repo, the tag is just the current directory's basename.** Ad-hoc one-off use of opencode in `~` or `/tmp` will produce noisy tags. If you care about clean analytics, run opencode from inside a git-tracked project.
- **Project root = nearest `.git`.** Works for normal repos, git submodules (`.git` is a file pointing at the parent), and git worktrees. If your project uses a different convention (e.g., no git, just a `package.json` at root), you can extend the hook function to look for that marker too.

## 8. (Optional) Customize the default tier

The `model` field at the top of `opencode.json` is the boot default when no `--agent` flag is passed. The example config defaults to `openai-via-gateway/gpt-5` because the primary workflow is frontier orchestration with cheaper subagents, not direct cheap-model coding. If you'd rather default to the free local tier and explicitly opt into frontier per session, change it to:

```json
"model": "ollama/granite4:7b-a1b-h"
```

The agent-specific `model` fields (under `agent.local`, `agent.oss`, `agent.frontier`) override the top-level default whenever you use `--agent <name>`.

## Common setup failures

See [LEARNINGS.md](LEARNINGS.md) for the full catalog. The quick hits:

| Symptom | Cause | Fix |
|---|---|---|
| `code 2019 "Chat completion bad format"` | Model name missing provider prefix on compat endpoint | Already handled — example config uses per-provider endpoints with bare names |
| `code 2001 "Please configure AI Gateway"` | Gateway slug typo in `CF_GATEWAY_NAME`, or no BYOK keys stored | Verify slug matches dashboard exactly; check Providers tab |
| `Unknown parameter: 'reasoningSummary'` | Using `@ai-sdk/openai-compatible` for gpt-5 family | Already handled — example uses `@ai-sdk/openai` for OpenAI |
| `model 'foo-7b' not found` from Ollama | OpenCode config key doesn't match Ollama's real model name | Make the OpenCode config key exactly match `ollama list` output (including colons) |
| Tool-call JSON in `content` field | Local model isn't tool-call-capable (e.g. qwen2.5-coder:7b) | Use granite4 or restrict local agent to read-only tools |
