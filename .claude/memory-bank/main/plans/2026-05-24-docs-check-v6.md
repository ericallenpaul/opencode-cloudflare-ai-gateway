# Executable Docs-Check (Config v6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an *executable* README depth-check to the opencode build agent's verification step. Unlike v2/v3 (advisory rules) and v4/v5 (judge-side rubric the model never sees), this puts a literal shell-runnable command with a numeric exit code into the build flow. The model has to invoke it and pass it before declaring completion. If a fifth run STILL produces a 1-line README, we've proven prompt-side won't ever land for this stack and the next move is R11 (hard test gate in the Playwright suite).

**Architecture:** Two small edits. The build-agent prompt in `opencode.example.json` gets a new "Documentation depth check" block in the verification section, placed AFTER the existing 5-step Playwright smoke-test. The check is a Node one-liner (cross-platform; Node is already a project dependency for `node --test`) that counts `## ` H2 headings and total line count in `README.md`, exits non-zero if either falls below threshold. Then a Config v6 bullet in `benchmarks/README.md` for the lineage doc.

**Tech Stack:** JSON edit (build-agent prompt is a JSON string), markdown.

**Why a Node one-liner instead of grep/Select-String:** cross-platform without forking on OS. The benchmark methodology assumes Node is available (judge uses `node --test`).

**Why count H2s + lines instead of regex-matching section names:** more robust. The agent might name a section `## Opening the editor` instead of `## How to open` — semantically equivalent but breaks an exact-string regex. Counting structural elements (>=5 H2 headings, >=40 lines) forces the agent to write sections without prescribing wording. Vacuous structure (5 stub headings) is still a cheat but catches the dominant failure mode (1-line README). The judge's scored rubric in `JUDGE-PROMPT.md` (v4) catches vacuous content downstream.

---

## Files touched

- Modify: `opencode.example.json` (the `agent.build.prompt` JSON string -- append a docs-check block after the existing 5-step Playwright smoke-test)
- Modify: `benchmarks/README.md` ("How we've iterated the opencode config" section: add Config v6 bullet)

---

## Task 1: Add executable docs-check to build agent verification

**File:** `opencode.example.json` (the value at JSON path `agent.build.prompt`)

- [ ] **Step 1.1: Locate the existing Playwright smoke-test block**

Open `opencode.example.json` and find the build-agent prompt string. Inside it, locate the v4 block that begins with `For ANY HTML deliverable, BEFORE claiming work complete you MUST execute this exact five-step smoke-test using the playwright MCP...`. The block ends with `Claiming completion without a passing five-step smoke-test is treated as a critical defect.` That entire block is followed by `\n` (escaped newline) and then other content.

- [ ] **Step 1.2: Append the docs-check block IMMEDIATELY AFTER the Playwright block**

Append this exact text (translated to JSON-escaped string: `\n` for newlines, `\"` for quotes, no raw tabs) immediately after the existing Playwright smoke-test block's closing sentence and before whatever follows:

```
AFTER the Playwright smoke-test passes, you MUST also pass a documentation depth check. Run this exact shell command (use the shell tool / Bash tool):

  node -e "const fs=require('fs');const md=fs.readFileSync('README.md','utf8');const headings=(md.match(/^## /gm)||[]).length;const lines=md.split('\n').filter(l=>l.trim().length>0).length;if(headings<5){console.error('README has only '+headings+' H2 headings; require >=5');process.exit(1);}if(lines<40){console.error('README has only '+lines+' non-blank lines; require >=40');process.exit(1);}console.log('README OK: '+headings+' H2 headings, '+lines+' non-blank lines');"

The command exits 0 on pass, 1 on fail. If it exits non-zero, fix README.md (add the missing sections per the spec's documentation rubric) and re-run BOTH the Playwright smoke-test AND this docs check. Do NOT declare completion until both exit 0. A README check that is skipped or whose failure is ignored is treated as a critical defect identical to a failed Playwright smoke-test.
```

CRITICAL JSON-escaping notes for this insertion:
- The Node `-e` argument is a single-quoted string. Inside it, `\n` (a literal backslash followed by n) appears in the regex literal `/^## /gm` (no, actually that has no backslash-n, the only `\n` is in `md.split('\n')`). When this whole thing becomes a JSON string value, the Node-source `\n` inside the single-quoted shell arg has to be escaped as `\\n` in the JSON string (so JSON-decoding gives `\n` to the shell, which then gives literal newline to Node).
- Verify your final JSON string by running ConvertFrom-Json (Step 1.3 below).

Specifically, the inner Node code `md.split('\n')` should appear in the JSON file as `md.split('\\n')` (so JSON decodes to `\n` which then becomes a literal newline character inside Node's single-quoted shell arg). Same for any other `\n` inside the Node source -- but actually there are none others, only that one.

The regex `/^## /gm` is a JavaScript regex literal -- no JSON or shell escaping needed for the forward slashes or the `^` or `m` flag.

The outer prompt text's literal newlines (the paragraph breaks I wrote in the appended block above) all become `\n` in the JSON string as usual.

- [ ] **Step 1.3: Validate the JSON parses**

```powershell
Get-Content opencode.example.json -Raw | ConvertFrom-Json | Out-Null
```
Expected: no error. A parse failure means an unescaped quote or newline slipped through.

- [ ] **Step 1.4: Validate the docs-check command itself works**

Test the Node one-liner against a real README in this repo. The root README.md is well-known to be long, so this should PASS:

```powershell
Push-Location $env:USERPROFILE\source\repos\opencode-cloudflare-ai-gateway
node -e "const fs=require('fs');const md=fs.readFileSync('README.md','utf8');const headings=(md.match(/^## /gm)||[]).length;const lines=md.split('\n').filter(l=>l.trim().length>0).length;if(headings<5){console.error('README has only '+headings+' H2 headings; require >=5');process.exit(1);}if(lines<40){console.error('README has only '+lines+' non-blank lines; require >=40');process.exit(1);}console.log('README OK: '+headings+' H2 headings, '+lines+' non-blank lines');"
Write-Host "Exit code: $LASTEXITCODE"
Pop-Location
```
Expected: prints `README OK: <n> H2 headings, <m> non-blank lines` and exits 0.

Now test the failure mode against a deliberately bad README:
```powershell
$tmp = New-TemporaryFile
Set-Content -Path $tmp -Value "# Tiny`n"
Push-Location $tmp.DirectoryName
# rename so README.md resolves
Copy-Item $tmp.FullName "$($tmp.DirectoryName)\README.md" -Force
node -e "const fs=require('fs');const md=fs.readFileSync('README.md','utf8');const headings=(md.match(/^## /gm)||[]).length;const lines=md.split('\n').filter(l=>l.trim().length>0).length;if(headings<5){console.error('README has only '+headings+' H2 headings; require >=5');process.exit(1);}if(lines<40){console.error('README has only '+lines+' non-blank lines; require >=40');process.exit(1);}console.log('README OK: '+headings+' H2 headings, '+lines+' non-blank lines');"
Write-Host "Exit code: $LASTEXITCODE"
Pop-Location
Remove-Item $tmp -ErrorAction SilentlyContinue
Remove-Item "$($tmp.DirectoryName)\README.md" -ErrorAction SilentlyContinue
```
Expected: prints `README has only 0 H2 headings; require >=5` and exits 1.

**If your $env:TEMP directory already contains a README.md, the test above will mutate it. Pick a fresh subdirectory if so.**

- [ ] **Step 1.5: Run check-setup.ps1 to confirm config still loads**

```powershell
.\scripts\check-setup.ps1
```
Expected: same PASS/FAIL set as before (12/12 PASS per the v4 baseline). No new failures.

- [ ] **Step 1.6: Commit**

```powershell
git add opencode.example.json
git commit -m "opencode build agent: add executable docs-check (>=5 H2, >=40 lines) after Playwright smoke-test"
```

---

## Task 2: Document Config v6 in benchmarks/README.md

**File:** `benchmarks/README.md` ("How we've iterated the opencode config" section)

- [ ] **Step 2.1: Add the Config v6 bullet**

Find the existing Config v5 bullet (it starts with `- **Config v5 (tool-selection workflow)**`). After it (at the same list level), add:

```
- **Config v6 (executable docs-check)**: across runs 1-3 the opencode agent emitted a one-line README despite three escalating prompt-side rules (v2 abstract, v3 concrete template, v4 scored rubric in JUDGE-PROMPT.md that the model never sees). The structural root cause: the build agent's completion gate is test-output-based (Playwright + node --test), and README depth has never been a gate -- it lives in the post-hoc quality dimensions. Same model (GPT-5) writes detailed READMEs under codex's harness and one-liners under opencode's; the variable is the harness's "am I done?" definition, not the model. Config v6 adds a Node one-liner to the build agent's verification step that runs AFTER the Playwright smoke-test and BEFORE completion is claimed. It counts H2 headings (`## `) and non-blank lines in README.md; exits non-zero if fewer than 5 headings or 40 lines. The model has to invoke it and observe its exit code. Vacuous structure (5 stub headings) can still pass this check, but the judge's content-based scored rubric (v4) catches that downstream. **This is the last prompt-side iteration**: if a fifth markdown-editor run STILL ships a 1-line README, the next move is to make README structure an R11 deterministic test in the Playwright suite (which would be the first benchmark change ever -- explicitly raising the bar, not lowering it).
```

- [ ] **Step 2.2: Commit**

```powershell
git add benchmarks/README.md
git commit -m "benchmarks README: document Config v6 (executable docs-check; last prompt-side iteration)"
```

---

## Self-review

1. **Spec coverage:** v6 covers the agreed change: executable docs-check (Node one-liner) in build verification, run after Playwright smoke-test, exits non-zero on failure. Lineage doc updated.
2. **Placeholders:** none.
3. **JSON safety:** Step 1.3 validates JSON parses. Step 1.4 validates the embedded Node code works against both PASS and FAIL inputs. Both gates must pass before commit.
4. **Bypass risks:** the model could skip the verification step entirely. Same failure mode as prior advisory rules. This plan accepts that risk and treats it as a falsification test -- if v6 fails, we know prompt-side will never land for this stack and we move to R11.
5. **No benchmark change yet.** SPEC/PROMPT/Playwright assertions remain byte-identical to prior runs. Only the opencode build-agent prompt changes.

---

## Execution

Subagent-driven:
- Task 1: `sonnet` (JSON edit + embedded Node code; highest care needed for escaping)
- Task 2: `haiku` (text edit only)
- Reviewer per task: `haiku`
