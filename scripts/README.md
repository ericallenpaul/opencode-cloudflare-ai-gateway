# scripts/

Two diagnostic tools, each with parallel PowerShell + Bash implementations.

## check-setup -- "am I ready to use this repo?"

`check-setup.ps1` (Windows) / `check-setup.sh` (macOS / Linux / Git Bash) walks every prerequisite in order and prints a PASS/FAIL per item with the exact fix command for anything missing. Pure diagnostic by default -- no env-var writes, no npm installs, no system changes. Pass `-InstallConfig` (PS) / `--install-config` (Bash) to ALSO copy `opencode.example.json` into place at `~/.config/opencode/opencode.json` (with a backup of any existing file).

Checks performed (in order):

1. OpenCode CLI on PATH
2. Node.js >= 18
3. CF_ACCOUNT_ID env var set
4. CF_GATEWAY_NAME env var set
5. CF_AIG_TOKEN env var set (reports length only -- value never logged)
6. OPENCODE_EXPERIMENTAL_LSP_TOOL == "true"
7. opencode.json exists at `~/.config/opencode/opencode.json`
8. Superpowers plugin installed AND wired up in opencode.json's `plugin` array
9. MCP servers configured (context7 required; cloudflare-docs and snyk optional)
10. Ollama running (optional -- local tier won't work without it)
11. granite4 model pulled in Ollama (optional)
12. PowerShell 7+ / Bash 4+ (defensive self-check)

Exit code 0 only if all REQUIRED checks pass. Optional failures emit warnings but don't fail the run.

```powershell
# Windows
.\check-setup.ps1                  # diagnostic only
.\check-setup.ps1 -InstallConfig   # also copy opencode.example.json into place (with backup)
```

```bash
# macOS / Linux / Git Bash
./check-setup.sh                   # diagnostic only
./check-setup.sh --install-config  # also copy opencode.example.json into place (with backup)
```

Run this FIRST before `verify-models` -- `check-setup` confirms the environment is in place; `verify-models` confirms the configured models are actually reachable through the gateway.

## verify-models -- "are the models I configured reachable?"

Two flavors:

| Script | Platform | Dependencies |
|---|---|---|
| `verify-models.ps1` | Windows (PowerShell 7+) | None beyond PS itself |
| `verify-models.sh` | macOS / Linux / Git Bash on Windows | `bash 4+`, `jq`, `curl` |

Both do the exact same thing: read `opencode.json`, walk every model entry in every configured provider, send a tiny "say hi" request through the appropriate gateway/local endpoint, and write pass/fail reports as both Markdown and JSON.

## verify-models usage

**Windows:**

```powershell
# Default — uses ~/.config/opencode/opencode.json, writes reports to script dir
.\verify-models.ps1

# Custom output directory
.\verify-models.ps1 -OutputDir .\reports

# Skip Ollama if it's not running
.\verify-models.ps1 -SkipOllama

# Shorter timeout (default is 60s for reasoning-model patience)
.\verify-models.ps1 -TimeoutSec 20
```

**macOS / Linux:**

```bash
chmod +x ./verify-models.sh       # one-time

./verify-models.sh                                  # defaults
./verify-models.sh -o ./reports                     # custom output
./verify-models.sh --skip-ollama                    # skip local
./verify-models.sh -t 20                            # shorter timeout
./verify-models.sh -c ~/my-opencode.json            # alternate config
./verify-models.sh -h                               # help
```

## Output

Two timestamped files per run:

- `verify-models-YYYYMMDD-HHMMSS.md` — human-readable summary table with a "Failures" section that includes diagnostic hints
- `verify-models-YYYYMMDD-HHMMSS.json` — machine-readable, including the actual error body from each failure

## Hand failures to AI

If any model fails, the report file path is printed at the end. Drag the **JSON** file into Claude / GPT / opencode and ask:

> "Why are these models failing? Here's the verification report: \[paste JSON\]"

The JSON includes the request URL pattern, model key, full error response, and per-model latency. That's almost always enough context for an AI assistant to diagnose.

**Safe to share:** the JSON report and the "Failures" section of the Markdown report **sanitize** your `CF_ACCOUNT_ID`, `CF_GATEWAY_NAME`, and `CF_AIG_TOKEN` — they appear as `<account-id>`, `<gateway>`, `<aig-token>` placeholders. Paste the report into a public issue or chat without leaking gateway identifiers.

(The PASS rows of the Markdown table are fine too — those only show model responses, not URLs.)

## What these scripts don't do

- **Don't use the OpenCode CLI** — they talk straight to the HTTP endpoints. This is intentional. `opencode run` is hard to drive programmatically (see `docs/LEARNINGS.md`), and bypassing it lets us isolate failures to the gateway/model layer.
- **Don't write to opencode config** — read-only. They only diagnose; fixing is on you.
- **Don't test tool calling** — they just send a chat message and read the response. To verify a model handles tools correctly (the granite4 vs qwen-coder distinction), probe Ollama directly per the procedure in `docs/LEARNINGS.md`.

## Exit codes

- `0` — all models passed (or were skipped)
- `1` — at least one model failed, or required env vars are missing

## Output equivalence

The PowerShell and Bash versions produce equivalent reports (same field names, same sanitization, same structure). The only practical difference: ms-precision latency on the Bash version requires either GNU date (Linux, Git Bash) or perl. Default macOS `date(1)` will fall back to seconds-precision; install `coreutils` via Homebrew (`brew install coreutils`) for full precision if you care.
