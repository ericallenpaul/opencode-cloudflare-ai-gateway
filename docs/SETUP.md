# Setup walkthrough

End-to-end setup, ~30 minutes if Cloudflare and Ollama are already in place. Most of that is "wait for `ollama pull`" and dashboard clicks. Tested on Windows 11 with PowerShell 7; the steps translate cleanly to macOS/Linux — the only Windows-specific bits are env var commands.

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

The local tier defaults to `granite4:7b-a1b-h` (IBM Granite 4, MoE 7B/1B active, ~4.2 GB, designed for agentic tool use). Other small models in this size class either don't handle function-calling correctly or burn too much VRAM.

```bash
ollama pull granite4:7b-a1b-h
```

Optional second pull for hybrid CPU+GPU work on larger sessions:

```bash
ollama pull qwen3-coder:30b
```

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
# expect: a clean natural-language greeting, no JSON

opencode run --agent oss "say hi"
# expect: a clean greeting via Workers AI Qwen-Coder 32B (~1s)

opencode run --agent frontier "say hi"
# expect: a clean greeting via gpt-5 (~3s including reasoning tokens)
```

If `local` works but `oss` or `frontier` doesn't, the most common cause is a BYOK key not being stored on the gateway side. Check the gateway dashboard's Providers tab — the provider you're trying to use should show as connected.

## 7. (Optional but recommended) Automatic per-user and per-project attribution

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

**Register a directory-change hook that walks up to the project root and sets the app tag.** This is a native shell mechanism — no wrapping of the `opencode` command, no prompt redefinition. The hook fires on every `cd`, walks up to find the nearest `.git` ancestor, and uses that directory's name as the app tag. So whether you're in `~/code/auth-api` or `~/code/auth-api/src/components`, the tag stays `auth-api`.

Once opencode launches, the env var is captured into the opencode process and stays fixed for that session — even if you `cd` elsewhere in your terminal afterwards.

```powershell
# Windows — add to your PowerShell $PROFILE (run `notepad $PROFILE` to open;
# create the file if missing).
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
# Set it once for the initial shell (before any cd)
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

The `model` field at the top of `opencode.json` is the boot default when no `--agent` flag is passed. The example config defaults to `ollama/granite4:7b-a1b-h` (free local) so you don't accidentally burn frontier tokens on a casual session. Change to whatever default suits you:

```json
"model": "openai-via-gateway/gpt-5"
```

The agent-specific `model` fields override this on `--agent` switches.

## Common setup failures

See [LEARNINGS.md](LEARNINGS.md) for the full catalog. The quick hits:

| Symptom | Cause | Fix |
|---|---|---|
| `code 2019 "Chat completion bad format"` | Model name missing provider prefix on compat endpoint | Already handled — example config uses per-provider endpoints with bare names |
| `code 2001 "Please configure AI Gateway"` | Gateway slug typo in `CF_GATEWAY_NAME`, or no BYOK keys stored | Verify slug matches dashboard exactly; check Providers tab |
| `Unknown parameter: 'reasoningSummary'` | Using `@ai-sdk/openai-compatible` for gpt-5 family | Already handled — example uses `@ai-sdk/openai` for OpenAI |
| `model 'foo-7b' not found` from Ollama | OpenCode config key doesn't match Ollama's real model name | Make the OpenCode config key exactly match `ollama list` output (including colons) |
| Tool-call JSON in `content` field | Local model isn't tool-call-capable (e.g. qwen2.5-coder:7b) | Use granite4 or restrict local agent to read-only tools |
