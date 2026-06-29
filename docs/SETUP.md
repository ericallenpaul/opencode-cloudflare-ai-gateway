# Setup walkthrough

End-to-end setup, ~30 minutes if you already have a Cloudflare account. Most of that is dashboard clicks and putting the config in the right place. Tested on Windows 11 with PowerShell 7; the steps translate cleanly to macOS/Linux -- the only Windows-specific bits are env var commands.

> **Shortcut**: at any point during this walkthrough -- and especially when you think you're done -- run `scripts/check-setup.ps1` (or `.sh`) to confirm every prerequisite is in place. It checks the required gateway/OpenCode setup, plus optional local-model pieces, and prints exact fix commands for anything missing. Pass `-InstallConfig` (or `--install-config`) to also copy `opencode.example.json` and local plugins into your opencode config dir with a backup of any existing file. The included orchestrator workers live under this repo's `.opencode/agents/`; copy that folder into your OpenCode config directory next to `opencode.json` so the workers are available globally. See [`scripts/README.md`](../scripts/README.md) for details.

## Prerequisites

| Thing | How to check |
|---|---|
| **OpenCode CLI** (≥ 1.14) | `opencode --version` |
| **Cloudflare account** with AI Gateway available | Dashboard → AI → AI Gateway |
| **At least one provider API key** (Anthropic, OpenAI, Google) | You have one ready to paste |
| **PowerShell 7+** (Windows) or **bash 4+** with `jq` and `curl` (mac/linux) | For env vars and the verify script |

On macOS, `jq` is usually `brew install jq`. On Debian/Ubuntu, `apt install jq curl`. On Fedora/RHEL, `dnf install jq curl`. PowerShell on Windows already has the equivalent of curl built in (Invoke-RestMethod).

If OpenCode isn't installed:

```bash
npm install -g opencode-ai
```

## 1. Create a Cloudflare AI Gateway

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

## 2. Set the three required env vars

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

## 3. Drop in the config

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\opencode" | Out-Null
Copy-Item .\opencode.example.json "$env:USERPROFILE\.config\opencode\opencode.json"
Copy-Item .\plugins "$env:USERPROFILE\.config\opencode\plugins" -Recurse -Force
```

```bash
# macOS/Linux
mkdir -p ~/.config/opencode
cp ./opencode.example.json ~/.config/opencode/opencode.json
cp -R ./plugins ~/.config/opencode/plugins
```

If you already have an opencode.json, **back it up first**: the example config wholesale replaces the `provider` and `agent` sections.

This repo also includes agent definitions in `.opencode/agents/`. Those files are part of the working setup, not optional examples. Copy them into your OpenCode config directory next to `opencode.json`:

```powershell
# Windows
Copy-Item .\.opencode\agents "$env:USERPROFILE\.config\opencode\agents" -Recurse -Force
```

```bash
# macOS/Linux
cp -R ./.opencode/agents ~/.config/opencode/agents
```

That makes the included `searcher`, `reader`, `coder`, and `planner` subagents available globally. Without them, the primary `build` agent cannot call its worker subagents.

## 4. Verify everything is reachable

**Windows (PowerShell):**

```powershell
.\scripts\verify-models.ps1
```

**macOS / Linux (bash):**

```bash
chmod +x ./scripts/verify-models.sh
./scripts/verify-models.sh
```

Both scripts do the same thing: read your opencode.json, check the configured gateway models, send a tiny test request to each, and write two report files. Local providers such as LM Studio are skipped by default because they are optional.

- `verify-models-<timestamp>.md` — human-readable summary
- `verify-models-<timestamp>.json` — machine-readable, useful when asking an AI assistant to diagnose failures

Reports sanitize your account ID, gateway name, and gateway token before writing, so they're safe to paste into issues or chat for AI-assisted debugging.

A clean run reports `PASS` for every required gateway model, with optional local models marked `SKIP` unless you explicitly include them. Any `FAIL` rows mean either the model isn't reachable from your gateway (BYOK key missing, model name typo, account tier restriction) or your env vars aren't set right.

## 5. First real run

For normal use, start OpenCode from your project directory:

```powershell
opencode
```

The named agents are still available when you want to test or override a specific path:

```powershell
opencode run --agent build "say hi"
# expect: the main orchestrator path

opencode run --agent oss "say hi"
# expect: a cheap hosted greeting via Workers AI / GLM

opencode run --agent frontier "say hi"
# expect: a clean greeting via gpt-5 (~3s including reasoning tokens)

opencode run --agent local "say hi"
# optional: only useful if you configured LM Studio or another local provider
```

If `oss` or `frontier` fails, the most common cause is a BYOK key not being stored on the gateway side. Check the gateway dashboard's Providers tab and make sure the provider you are using shows as connected.

## 6. (Recommended) Automatic per-user and per-project attribution

The example config includes `plugins/sync-user-env.js`, which attaches a `cf-aig-metadata` header to every gateway-routed request. The metadata keys are `app` (the repo or directory where OpenCode started) and `user` (you), so Cloudflare Gateway analytics can filter by project and developer.

The plugin does three things at OpenCode startup:

1. Promotes Windows User-scoped environment variables into the OpenCode process.
2. Computes `OPENCODE_APP_TAG` from the nearest git root if it is missing.
3. Writes the final `cf-aig-metadata` header directly into each Cloudflare Gateway provider.

The PowerShell profile hook below is still useful. It keeps `OPENCODE_APP_TAG` visible in your interactive shell and gives child shell commands a useful tag. The plugin is the safety net for OpenCode provider requests.

Two small bits of one-time setup make this automatic for every future opencode invocation:

**Set your user tag once (persistent):**

```powershell
# Windows
[Environment]::SetEnvironmentVariable("OPENCODE_USER_TAG", $env:USERNAME, "User")
```

```bash
# macOS / Linux -- add to ~/.bashrc, ~/.zshrc, etc.
export OPENCODE_USER_TAG="$USER"
```

**Register a directory-change hook that walks up to the project root and sets the app tag.** The hook runs when your shell starts and again whenever you `cd`. It finds the nearest `.git` directory and uses that repo name as the app tag, so nested paths like `~/code/auth-api/src/components` still report as `auth-api`.

Once opencode launches, the env var is captured into the opencode process and stays fixed for that session — even if you `cd` elsewhere in your terminal afterwards.

```powershell
# Windows -- recommended: install the hook from this repo.
.\scripts\install-opencode-app-tag.ps1
```

That script adds a small managed block to your PowerShell profile, sets `OPENCODE_APP_TAG` for the current shell, and makes future PowerShell sessions keep it updated on each `cd`.

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
# bash -- add to ~/.bashrc
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
# zsh -- add to ~/.zshrc
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

Run a quick query in any directory, then go to the CF dashboard -> AI Gateway -> your gateway -> Analytics. Filter by `metadata.app` or `metadata.user`. You should see the directory/repo name and user tag show up. If app values are empty, confirm the plugin was copied next to the installed `opencode.json` and is present in the top-level `plugin` array.

### Caveats

- **Config-load timing is intentional.** The plugin computes and injects metadata when OpenCode starts. Once OpenCode is running, even if you `cd` elsewhere in your terminal, the session keeps its original tag — which is what we want. Each OpenCode session = one project tag.
- **Outside a git repo, the tag is just the current directory's basename.** One-off use of opencode in `~` or `/tmp` will produce noisy tags. If you care about clean analytics, run opencode from inside a git-tracked project.
- **Project root = nearest `.git`.** Works for normal repos, git submodules (`.git` is a file pointing at the parent), and git worktrees. If your project uses a different convention (e.g., no git, just a `package.json` at root), you can extend the hook function to look for that marker too.

## 7. (Optional) Local models

Local models are no longer part of the required setup. I tried hard to make the local tier useful because "free local workers" sounds like the cleanest version of the cost-saving story. I did get local tool-calling working, but only with the right runtime, model, context size, and tool-call format. On my hardware, it was still too slow to be my daily driver.

What I learned:

- Ollama was not reliable enough for OpenCode tool-calling in this setup.
- The failures were model-specific but all frustrating: silent runs, malformed tool tags, wrong protocol, or tool definitions getting lost.
- LM Studio worked better because its OpenAI-compatible server and model templates were more reliable.
- Context size matters. The default `n_ctx=4096` was too small once OpenCode prompts, tool definitions, MCP tools, and the user request were all in the window.
- The first local setup that actually worked was LM Studio + `qwen3-coder-30b-a3b-instruct` + `n_ctx=16384` + `"tools": true`.
- Even when it worked, local subagent calls took 120-240 seconds on consumer GPU hardware.

So the current config keeps local as optional and hardware-dependent, not required. The recommended path is still:

- `gpt-5` for the primary `build` orchestrator
- `gpt-5-mini` for the implementation `coder`
- GLM 4.7 Flash for cheap search/read/planning workers through Cloudflare AI Gateway

If you do want to use local models, start with LM Studio:

1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai).
2. Download `qwen3-coder-30b-a3b-instruct` or another Qwen3 Coder variant that fits your GPU.
3. Before loading the model, set context length to `16384` or higher if your hardware can handle it.
4. Start LM Studio's local server at `http://127.0.0.1:1234`.
5. Keep the `lmstudio` provider block from `opencode.example.json`.
6. Point `agent.local.model` at `lmstudio/qwen3-coder-30b-a3b-instruct`.

The important part of the OpenCode config is:

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

The `"tools": true` flag matters. Without it, OpenCode may not route tool-call traffic to the model correctly.

See [`LEARNINGS.md` -> "Local LLM tool-calling with opencode is real, hard, and runtime-sensitive"](LEARNINGS.md) for the longer debug story.

## 8. (Optional) Customize the default model

The `model` field at the top of `opencode.json` is the boot default when no `--agent` flag is passed. The example config defaults to `openai-via-gateway/gpt-5` because the primary workflow is frontier orchestration with cheaper subagents, not direct cheap-model coding.

The agent-specific `model` fields under `agent.local`, `agent.oss`, `agent.frontier`, and `agent.build` override the top-level default whenever you use `--agent <name>`.

## Common setup failures

See [LEARNINGS.md](LEARNINGS.md) for the full catalog. The quick hits:

| Symptom | Cause | Fix |
|---|---|---|
| `code 2019 "Chat completion bad format"` | Model name missing provider prefix on compat endpoint | Already handled — example config uses per-provider endpoints with bare names |
| `code 2001 "Please configure AI Gateway"` | Gateway slug typo in `CF_GATEWAY_NAME`, or no BYOK keys stored | Verify slug matches dashboard exactly; check Providers tab |
| `Unknown parameter: 'reasoningSummary'` | Using `@ai-sdk/openai-compatible` for gpt-5 family | Already handled — example uses `@ai-sdk/openai` for OpenAI |
| Included subagent not found | `.opencode/agents/` was not copied into the OpenCode config directory | Copy `.opencode\agents\` to `%USERPROFILE%\.config\opencode\agents\` on Windows, or `./.opencode/agents` to `~/.config/opencode/agents` on macOS/Linux |
| Local model returns no tool calls | Local runtime/model/context shape is wrong | Treat local as optional; if using it, use LM Studio, Qwen3 Coder, `n_ctx=16384+`, and `"tools": true` |
