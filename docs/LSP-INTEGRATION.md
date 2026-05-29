# LSP Integration

Wiring language servers into the tiered-agent setup so subagents can answer code questions with **structured ground truth** instead of reading files and guessing. **OpenCode has native, built-in support** for LSP — this doc covers how it works, what's auto-included, and how to add anything that isn't.

> **Heads up — three things must all be true for the LSP tool to work** in OpenCode 1.15.5:
> 1. **`OPENCODE_EXPERIMENTAL_LSP_TOOL=true` env var** is set (the lsp tool is experimental, gated at runtime). Without this the tool literally isn't loaded — config tweaks won't fix it.
> 2. **Per-agent `tools: { "lsp": true }` and/or `permission: { "lsp": "allow" }`** in `opencode.json` for any agent that should call LSP operations.
> 3. **A prompt nudge** instructing the model to actually use the tool — without it, models default to grep.
>
> The example config in this repo handles (2) and (3). Step (1) is per-machine env config — see "Required setup" below.

## Why this matters: the token math

Most coding-agent token cost goes to **reading files trying to figure out what's true**. An LSP replaces "read everything and infer" with "ask a precise question, get a precise answer." That delta is the entire pitch.

### What the agent typically does without LSP

To answer "what does `parseFoo` take and where is it called from?" the agent has to:

1. **Grep** for `parseFoo` across the repo → match list with surrounding context
2. **Read** the file(s) that define it → maybe 100–500 lines of file context
3. **Read** the type definitions imported into that file → maybe more files
4. **Read** each caller's surrounding code to confirm context → many more files
5. **Infer** the signature from the source it just read → can be wrong, especially in dynamically-typed code

Net cost: easily **2,000–10,000 tokens** of context for one symbol question. Some of it hallucinated.

### What the agent does with LSP

Same question:

1. `textDocument/definition` for `parseFoo` → returns `file:42:1`
2. `textDocument/hover` at that location → returns the signature, JSDoc/docstring, types
3. `textDocument/references` for the symbol → returns a list of `{file, line, col}` entries

Net cost: **~100–300 tokens** of structured response. Ground truth, not inferred.

**Roughly an order of magnitude less context per code-understanding query**. For an agent making dozens of such queries in a session, that's the difference between hitting a token-budget wall mid-task and finishing comfortably under it.

### Where the savings compound

Same shape as the other integrations:

| Tier | Why LSP matters more for this tier |
|---|---|
| **Mechanical subagents (searcher, reader, planner)** | Small/cheap models should not reason their way through a large codebase from raw files. An LSP gives them precise structured signals that more than compensate for lower reasoning capacity. This is the single biggest leverage point for cheap worker roles. |
| **Implementation subagent (coder)** | The coder currently uses `gpt-5-mini`, not GLM, because markdown-editor showed cheap hosted OSS was false economy for implementation. LSP still saves coder tokens by avoiding broad file reads and by surfacing diagnostics after edits. |
| **Frontier orchestrator** | Frontier tokens are most expensive; even a modest reduction in file-reading per request saves real money. |

## Required setup (the experimental flag)

OpenCode 1.15.5 gates the `lsp` tool behind an experimental runtime flag. Without the flag, the LSP servers still run (diagnostics work passively) but the agent-callable `lsp` tool is **never added to the tool registry** — meaning the model can't invoke it, and any prompt nudging is moot.

Source confirmation: `packages/opencode/src/tool/registry.ts` has:

```typescript
builtin: [
  /* always-on tools */,
  ...(flags.experimentalLspTool ? [tool.lsp] : []),    // ← gate
  /* ... */
]
```

The flag is read from environment:

```powershell
# Windows — persistent
[Environment]::SetEnvironmentVariable("OPENCODE_EXPERIMENTAL_LSP_TOOL", "true", "User")
```

```bash
# macOS / Linux — add to ~/.bashrc, ~/.zshrc:
export OPENCODE_EXPERIMENTAL_LSP_TOOL=true
```

**Critical**: user-scope env vars only show up in **new process trees**. After setting on Windows you must **fully close ALL Windows Terminal / PowerShell windows** (the whole app, not just tabs) and reopen for the variable to propagate. Same on macOS/Linux — open a fresh shell. Verify in the new shell:

```powershell
$env:OPENCODE_EXPERIMENTAL_LSP_TOOL   # must print: true
```

The opencode process inherits its env from the shell that launches it. If the env var isn't in the shell, it isn't in opencode, and the lsp tool never registers — even with the right `opencode.json`.

You can also use the broader `OPENCODE_EXPERIMENTAL=true` to enable several experimental features (LSP tool, Scout, Plan Mode, etc.) at once. Per-feature flags are more targeted and recommended.

## How OpenCode handles LSP

OpenCode exposes the LSP via two distinct mechanisms:

1. **Diagnostics feedback** (passive). When the agent edits a file, opencode forwards LSP diagnostics — type errors, lints, SAST warnings — back to the agent. The agent can self-correct without you reviewing line by line.
2. **The `lsp` tool** (active). The agent can directly invoke 9 LSP operations: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`. Each takes a `filePath` + `line` + `character` (the `workspaceSymbol` filePath is only used to pick which LSP to ask — the query searches the whole workspace).

The *capability* is there. **The behavior isn't automatic, though** — see "Nudging the model to use LSP" below.

LSP servers are configured via the top-level **`"lsp"`** key in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {}
}
```

| Setting | Effect |
|---|---|
| `"lsp": true` | Enable **all built-in LSPs** as-is. |
| `"lsp": {}` | Same as `true`, but the object form lets you add overrides or custom servers below. **This is what the example config uses.** |
| `"lsp": false` or omitted | All LSPs **off**. Default behavior — opt in deliberately. |
| `"lsp": { "<name>": { "disabled": true } }` | Disable one built-in by name (e.g. `"typescript"`, `"eslint"`). |
| `"lsp": { "<name>": { "command": [...], "extensions": [...] } }` | Define a **custom** LSP server. Use this for languages opencode doesn't bundle. |

Per-server entry properties:

| Property | Type | Description |
|---|---|---|
| `disabled` | boolean | Set to `true` to disable. |
| `command` | string[] | Command + args to start the LSP server. |
| `extensions` | string[] | File extensions this server handles. |
| `env` | object | Environment variables for the server process. |
| `initialization` | object | LSP `initializationOptions` payload. |

## Built-in LSPs (no install required from you)

OpenCode bundles auto-detection and (for several) auto-install logic for these languages. Open a project with files of these extensions and the LSP springs to life:

| LSP | Extensions | Requirements |
|---|---|---|
| astro | `.astro` | auto-installs for Astro projects |
| bash | `.sh`, `.bash`, `.zsh`, `.ksh` | auto-installs `bash-language-server` |
| clangd | `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp` (etc) | auto-installs for C/C++ projects |
| csharp | `.cs`, `.csx` | `.NET SDK` installed |
| clojure-lsp | `.clj`, `.cljs`, `.cljc`, `.edn` | `clojure-lsp` on PATH |
| dart | `.dart` | `dart` on PATH |
| deno | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` | `deno` on PATH (auto-detects `deno.json`) |
| elixir-ls | `.ex`, `.exs` | `elixir` on PATH |
| eslint | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`, `.vue` | `eslint` dep in project |
| fsharp | `.fs`, `.fsi`, `.fsx`, `.fsscript` | `.NET SDK` installed |
| gleam | `.gleam` | `gleam` on PATH |
| gopls | `.go` | `go` on PATH |
| hls | `.hs`, `.lhs` | `haskell-language-server-wrapper` on PATH |
| jdtls | `.java` | `Java SDK 21+` installed |
| julials | `.jl` | `julia` + `LanguageServer.jl` |
| kotlin-ls | `.kt`, `.kts` | auto-installs |
| lua-ls | `.lua` | auto-installs |
| nixd | `.nix` | `nixd` on PATH |
| ocaml-lsp | `.ml`, `.mli` | `ocamllsp` on PATH |
| oxlint | various JS/TS/Vue/Svelte/Astro | `oxlint` dep in project |
| php intelephense | `.php` | auto-installs |
| prisma | `.prisma` | `prisma` on PATH |
| pyright | `.py`, `.pyi` | `pyright` installed |
| razor | `.razor`, `.cshtml` | `.NET SDK` + VS Code C# extension |
| ruby-lsp | `.rb` | `ruby-lsp` gem installed |
| (rust-analyzer / typescript / others) | — | check `opencode.ai/docs/lsp/` for the always-current list |

For everything in this list, **just enable LSP** in `opencode.json` (the example config already does this) and opencode handles discovery and launch. Install the language toolchain (e.g. `.NET SDK`, Java SDK) if it's not already on your machine for languages that require it.

## Adding PowerShell (not built-in)

PowerShell isn't in opencode's built-in list. Add it as a **custom LSP** pointing at the `PowerShellEditorServices` bundle that ships with the VS Code PowerShell extension (or a standalone GitHub release).

### Locate the bundle

```powershell
Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Directory -Filter "ms-vscode.powershell-*" |
    Select-Object -First 1 -ExpandProperty FullName
```

Expect something like `C:\Users\<you>\.vscode\extensions\ms-vscode.powershell-2025.4.0`. Inside that path:

- The LSP startup script is at `modules\PowerShellEditorServices\Start-EditorServices.ps1`
- The bundled modules path is at `modules\`

If the VS Code extension isn't installed: `code --install-extension ms-vscode.powershell`. Or grab a standalone release ZIP from <https://github.com/PowerShell/PowerShellEditorServices/releases>.

### Add to `opencode.json`

Plug in the path you found above. Example with a typical install:

```json
{
  "lsp": {
    "powershell": {
      "command": [
        "pwsh", "-NoLogo", "-NoProfile",
        "-Command",
        "& 'C:\\Users\\<you>\\.vscode\\extensions\\ms-vscode.powershell-2025.4.0\\modules\\PowerShellEditorServices\\Start-EditorServices.ps1' -HostName 'opencode' -HostProfileId 'opencode' -HostVersion '1.0.0' -BundledModulesPath 'C:\\Users\\<you>\\.vscode\\extensions\\ms-vscode.powershell-2025.4.0\\modules' -LogPath '$env:TEMP\\pses.log' -LogLevel 'Normal' -SessionDetailsPath '$env:TEMP\\pses-session.json' -Stdio"
      ],
      "extensions": [".ps1", ".psm1", ".psd1"]
    }
  }
}
```

A few notes about this entry:

- **PSScriptAnalyzer comes bundled.** It's PowerShell's standard linter — catches real security issues (`Invoke-Expression` on user input, plaintext credentials in scripts, deprecated cmdlets, etc.). Through the LSP it surfaces as live diagnostics — inline SAST scanning, included automatically. Pairs with the [Snyk MCP](MCP-INTEGRATION.md#snyk--security-scanning) which covers other languages.
- **Startup is heavier than most other LSPs.** PowerShellEditorServices runs as a .NET host; expect a few seconds before it's responsive on first launch. Fine for interactive use; worth noting for automation that spins up many short-lived sessions.
- **VS Code extension version is part of the path.** When you update the extension (or it auto-updates), the directory name changes. You'll need to refresh the `command` paths in `opencode.json`. Worth a small wrapper script if this gets annoying.

### Verify it's working

```powershell
opencode --print-logs --log-level INFO 2>&1 | Select-String "lsp|powershell"
```

You should see opencode detect the LSP entry and try to launch it. If it fails, the log usually has the underlying error (path wrong, pwsh missing, etc.).

## Nudging the model to use LSP (critical)

A real-world test (2026-05-20, gpt-5-mini via the `build` agent, asking "which file manages the actual reply?") confirmed the LSP servers were loaded — but **the agent grepped instead of using the `lsp` tool**. Three compounding reasons:

1. **Chicken-and-egg on `filePath`.** Most LSP operations need a starting `filePath`+`line`+`character`. For an opening question like "where is X handled?" the model has no file:line yet, so it falls back to grep. The `workspaceSymbol` op doesn't need a real position (only a workspace-resident filePath to pick the right LSP), but the model didn't realize that.
2. **The `lsp.txt` tool description doesn't sell when to use it.** It lists operations and parameters, but never tells the model *"prefer this over grep for symbol lookups."* Models default to whatever their training emphasizes — and that's grep.
3. **Smaller models bias toward familiar patterns.** gpt-5-mini, qwen-coder, granite — they all default to grep even with `lsp` in their toolbox.

**Fix: add a `prompt` field to your code-touching agents.** OpenCode's `AgentConfig.prompt` is concatenated into the system message. A short biasing instruction is all that's needed — and it's **safe to ship the same one whether or not LSP is enabled** because the "when available" / "fall back when not in your toolset" phrasing makes it conditional from the model's perspective.

The example config (`opencode.example.json`) ships this prompt on every code-touching agent:

```text
For code symbol lookups (classes, functions, types, methods): prefer the lsp tool when available — use lsp.workspaceSymbol for project-wide symbol search, lsp.goToDefinition / lsp.findReferences / lsp.hover for navigation. Fall back to grep only when the lsp tool isn't in your toolset, or for non-symbol text searches (strings, comments, configs).
```

This works for `build` (overrides opencode's built-in), `local`, `oss`, `frontier`, and any other code-touching agent. No two-prompt maintenance needed — the conditional phrasing is the trick. Skip the prompt on read-only or non-code agents where LSP isn't relevant.

**Without this nudge, the LSP tool gets ignored.** The order-of-magnitude token savings claimed earlier in this doc only materialize when the model actually invokes the LSP — which only happens reliably with an explicit prompt nudge. This is the difference between LSP being a passive diagnostics layer (always on, no model action needed) and an active query layer (requires model to choose `lsp` over `grep`). The nudge enables the second mode.

**This step is highly recommended for any setup that enables LSP.** The example config does both — `"lsp": {}` enables the LSPs, and the per-agent `prompt` ensures the model actually uses the tool. Consider them a pair.

## Tier interaction: where LSP belongs

LSP is **on by default for every agent** that touches code, because opencode's LSP integration surfaces diagnostics — every model benefits from getting type errors back after edits, regardless of tier.

| Agent | LSP active? | Why |
|---|---|---|
| **`build`** (frontier orchestrator) | Yes | Asks ground-truth questions before reasoning. Frontier-tier cost makes file-reading especially wasteful. |
| **`searcher`** (GLM worker) | Yes — **biggest leverage point** | Searcher's job is "locate things in the codebase." LSP turns this from "grep + read" into "structured lookup." Token savings here are largest. |
| **`reader`** (GLM worker) | Yes | "Summarize this function" benefits from knowing the signature and call sites before reading. |
| **`coder`** (`gpt-5-mini`) | Yes | Before editing, verify call sites. After editing, see diagnostics. Both via LSP. |
| **`planner`** (GLM worker) | Yes | "Current state of the auth module" → LSP returns the symbol map; planner doesn't need to read 30 files. |

The orchestrator/subagent architecture doesn't change LSP behavior — diagnostics still flow from the running LSPs to whichever agent is editing.

## Why LSP is the cheapest "force multiplier" available

Comparing the three integration layers on top of the core tier setup:

| Layer | What it adds | Token cost | Token savings | Net effect |
|---|---|---|---|---|
| **MCPs** (shipped) | External grounding (docs, security) | Modest tool defs + occasional results | Reduces hallucination on lib usage | Mixed — saves rework, costs per-lookup |
| **LSP** (now shipped) | Structured code Q&A + diagnostics feedback | Trivial — opencode-internal | Diagnostics-driven self-correction, order-of-magnitude per code question | Cost down dramatically + quality up |
| **Superpowers** | Process discipline (TDD, brainstorming, etc.) | Skill prompts on orchestrator | Reduces rework | Quality up |

LSP is unique in being **almost pure win** — virtually no static cost to the agent's context (opencode mediates), large per-query and per-edit-cycle benefit, available for nearly every mainstream language via the built-in set. The only friction is installing the toolchain for languages that require one (`.NET SDK`, Java SDK, Go toolchain, etc.) — which you almost certainly already have if you're editing those languages.

## See also

- [PROBLEM.md](PROBLEM.md) — the cost-tier thesis this builds on
- [ARCHITECTURE.md](ARCHITECTURE.md) — where LSPs sit in the tier topology
- [SUPERPOWERS-INTEGRATION.md](SUPERPOWERS-INTEGRATION.md) — how process skills fit with the orchestrator/subagent setup
- [MCP-INTEGRATION.md](MCP-INTEGRATION.md) — companion external-grounding layer
- [OpenCode LSP docs](https://opencode.ai/docs/lsp/) — authoritative reference for the built-in list and config schema
- [Language Server Protocol spec](https://microsoft.github.io/language-server-protocol/) — the underlying standard
