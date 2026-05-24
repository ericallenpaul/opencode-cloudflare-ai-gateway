# Benchmark Improvements v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply three lessons from `markdown-editor` run `2026-05-24-0758`:
(a) make Documentation a *scored* rubric inside `SPEC.md` + `JUDGE-PROMPT.md` instead of relying on prompt-side rules that the agent ignores;
(b) tighten the opencode build-agent verification to require an explicit five-step Playwright MCP browser smoke-test for any HTML deliverable;
(c) add a CLI preflight to `bench-run.ps1` so codex token-exhaustion (or any tool being unreachable) is caught before the bench window opens, not after.

We deliberately do NOT change PROMPT.md or the Playwright R1-R10 assertions. Those are the fixed bar -- "tune the tool, not the test."

**Architecture:** Four small, independent file edits. No new modules, no new dependencies. Each task ends in its own commit so partial completion stays useful.

**Tech Stack:** Markdown (SPEC.md, JUDGE-PROMPT.md, README.md), JSON (opencode.example.json), PowerShell (bench-run.ps1).

---

## Files touched

- Modify: `benchmarks/markdown-editor/SPEC.md` (Quality dimensions, lines 20-28)
- Modify: `benchmarks/scripts/judge/JUDGE-PROMPT.md` (Documentation rubric, lines 132-141; score-table column hint, line ~180)
- Modify: `opencode.example.json` (build-agent prompt at `agent.build.prompt`)
- Modify: `benchmarks/scripts/bench-run.ps1` (insert helper after the `Get-NowIso` function ~line 126; insert preflight block in the start phase before the baseline-capture loop ~line 175)
- Modify: `benchmarks/README.md` ("How we've iterated the opencode config" section, add Config v4 bullet)

No file creation. No tests added -- this layer has no existing test harness; validation is by the next benchmark run.

---

## Task 1: Scored Documentation rubric in SPEC.md

Documentation becomes a 0-5 score = count of required README sections present. Mechanical, not holistic.

**Files:**
- Modify: `benchmarks/markdown-editor/SPEC.md:28`

- [ ] **Step 1.1: Replace the Documentation dimension entry**

Open `benchmarks/markdown-editor/SPEC.md`. Find line 28:

```
- **Documentation** -- README explains the implemented subset, what's NOT implemented, and states the security model (sanitizer used? hand-rolled escaping? library?)
```

Replace with:

```
- **Documentation (scored 0-5 as the COUNT of required README sections present; mechanical, not holistic)**:
  1. README exists with a meaningful title beyond the project name alone (a single H1 stub does NOT count).
  2. Explains how to open the deliverable (e.g., `open markdown.html` or `file://...`).
  3. Provides the EXACT test command (e.g., `node --test markdown.test.js`).
  4. Lists the implemented markdown subset AND explicitly states what is NOT implemented.
  5. States the security model (sanitizer used? hand-rolled escaping? library?).
  A README that contains only a title scores 0. Each missing section costs 1 point. This dimension scores the README file only; inline code comments and test-file descriptions do not contribute (they are reflected in Readability and Test breadth instead).
```

- [ ] **Step 1.2: Verify the markdown still parses**

Render the file in any markdown viewer (or visually scan for broken list nesting). The Quality dimensions list should still read as five bullets, with Documentation as the fifth bullet now containing a nested 1-5 sub-list.

- [ ] **Step 1.3: Commit**

```powershell
git add benchmarks/markdown-editor/SPEC.md
git commit -m "SPEC: make markdown-editor Documentation a scored 0-5 rubric (count of required README sections)"
```

---

## Task 2: Align JUDGE-PROMPT.md Documentation rubric

The qualitative-judge agent reads `JUDGE-PROMPT.md`, not `SPEC.md`. If the two disagree, judge follows the prompt. Bring them into alignment.

**Files:**
- Modify: `benchmarks/scripts/judge/JUDGE-PROMPT.md:132-141`
- Modify: `benchmarks/scripts/judge/JUDGE-PROMPT.md:~180` (the Documentation row in the scoring table)

- [ ] **Step 2.1: Replace the Documentation rubric block (lines 132-141)**

Current:
```
### Documentation
- **1**: No README, no comments, no explanation of how to run tests.
- **2**: README exists but is minimal (e.g., just "open the html file").
- **3**: README explains how to open the deliverable AND how to run tests with
  the exact command.
- **4**: README explains what was built, known limitations, and test coverage.
  Inline comments explain non-obvious logic.
- **5**: README is clear enough for a non-engineer. Inline comments explain
  every design decision. Test file has a brief description of what each test
  covers.
```

New:
```
### Documentation
The Documentation score is the COUNT (0-5) of these five required README sections that are present. This is mechanical -- read the README file and tick off sections. Do NOT factor in inline comments or test-file descriptions; those belong to Readability and Test breadth respectively.

- **Section 1**: README exists with a meaningful title beyond the project name alone (a single-H1 stub does NOT count -- it must be followed by at least one substantive paragraph or section).
- **Section 2**: Explains how to open the deliverable (`open markdown.html`, `file://...`, or a "double-click the html" instruction).
- **Section 3**: Provides the EXACT test command (e.g., `node --test markdown.test.js`).
- **Section 4**: Lists the implemented markdown subset AND explicitly states what is NOT implemented.
- **Section 5**: States the security model (sanitizer used? hand-rolled escaping? library?).

Worked examples:
- README is just `# Markdown Editor` and nothing else: **0** (section 1 fails -- title alone is not meaningful content).
- README has the title plus an open instruction only: **2**.
- README has all five sections: **5**.

When you fill in the score, justify it by listing which section numbers were present and which were missing.
```

- [ ] **Step 2.2: Update the score-table column hint**

Find the row in the Quality scores table (around line 180):
```
| Documentation | [1-5] | [one sentence]                       |
```
Replace with:
```
| Documentation | [0-5] | [list section numbers present/missing] |
```

- [ ] **Step 2.3: Commit**

```powershell
git add benchmarks/scripts/judge/JUDGE-PROMPT.md
git commit -m "JUDGE-PROMPT: Documentation becomes a counted 0-5 rubric (one point per README section)"
```

---

## Task 3: Require explicit Playwright MCP smoke-test in build agent

Current build-agent prompt says Playwright MCP "is available" and treat browser verification as "non-negotiable when the MCP is available." Run 3 showed agents claim verification they didn't perform. Replace with a five-step required smoke-test that has no wiggle room.

**Files:**
- Modify: `opencode.example.json` (the `agent.build.prompt` string)

- [ ] **Step 3.1: Locate the current verification block**

Open `opencode.example.json`. The build-agent prompt lives at JSON path `agent.build.prompt`. It is a single JSON string with escaped newlines (`\n`). Find the substring that mentions `browser_navigate`, `browser_type`, `browser_snapshot`, and "non-negotiable" -- that is the block to replace.

- [ ] **Step 3.2: Replace with the new five-step requirement**

Replace the existing browser-verification paragraph with this exact text (remember to JSON-escape: `"` -> `\"`, newline -> `\n`):

```
For ANY HTML deliverable, BEFORE claiming work complete you MUST execute this exact five-step smoke-test using the playwright MCP, in this order, even if you also tested the code another way: (1) browser_navigate to the file:// path of the deliverable; (2) browser_snapshot to capture the initial rendered DOM; (3) if the deliverable has a text input, browser_type a known test string into it (for markdown, use `# Hello`) and browser_snapshot again to capture the post-interaction DOM; (4) check browser_console_messages and confirm there are ZERO JavaScript errors; (5) confirm the expected output region (e.g., live-preview pane) is non-empty in the post-interaction snapshot. If any of the five steps fails or any console error appears, fix the underlying bug and re-run all five steps -- do not partial-pass. If the playwright MCP is unavailable in this session, HALT and report 'browser verification could not be performed -- deliverable not validated'; do NOT claim completion. Claiming completion without a passing five-step smoke-test is treated as a critical defect.
```

- [ ] **Step 3.3: Validate the JSON parses**

```powershell
Get-Content opencode.example.json -Raw | ConvertFrom-Json | Out-Null
```
Expected: no output, no error. A parse error means an unescaped `"` or newline slipped through.

- [ ] **Step 3.4: Run check-setup.ps1 to confirm the example config still passes its diagnostic**

```powershell
.\scripts\check-setup.ps1
```
Expected: the same PASS/FAIL set as before the change. Any NEW failure introduced by this commit means the JSON is malformed in a way ConvertFrom-Json didn't catch (rare but possible).

- [ ] **Step 3.5: Commit**

```powershell
git add opencode.example.json
git commit -m "opencode build agent: require explicit 5-step Playwright MCP smoke-test for every HTML deliverable"
```

---

## Task 4: CLI preflight in bench-run.ps1 start phase

Catch unreachable tool binaries (codex out of tokens, claude not installed, opencode not on PATH) BEFORE the baseline ccusage snapshot. Cheap version-check only -- this does not exercise the API.

**Files:**
- Modify: `benchmarks/scripts/bench-run.ps1` (insert helper after line ~126; insert preflight in start phase before line ~177)

- [ ] **Step 4.1: Add the `Test-ToolReachable` helper**

Open `benchmarks/scripts/bench-run.ps1`. Find the `Get-NowIso` function (around line 124-126). Immediately AFTER its closing brace, insert:

```powershell
function Test-ToolReachable {
    param(
        [Parameter(Mandatory)][string]$ToolName,
        [Parameter(Mandatory)][string]$VersionCommand
    )
    try {
        $cmd = Get-Command $ToolName -ErrorAction Stop
    } catch {
        return @{ Ok = $false; Detail = "$ToolName not found on PATH" }
    }
    try {
        $out = & cmd /c "$VersionCommand 2>&1" | Out-String
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            return @{ Ok = $false; Detail = "$ToolName --version exited $exit -- $($out.Trim())" }
        }
        return @{ Ok = $true; Detail = ($out.Trim() -split "`n")[0] }
    } catch {
        return @{ Ok = $false; Detail = "$ToolName invocation error: $_" }
    }
}
```

- [ ] **Step 4.2: Call the preflight in the start phase**

Find the `if ($Phase -eq "start")` block (around line 163). Locate the `Write-Host "Tools:     $($validToolNames -join ', ')"` line and the blank `Write-Host ""` immediately after it. AFTER that blank line, and BEFORE the `foreach ($t in $Tools)` baseline-capture loop, insert:

```powershell
    Write-Host "Preflight: verifying each tool CLI is reachable..." -ForegroundColor DarkGray
    $preflightFailures = @()
    foreach ($t in $Tools) {
        $check = Test-ToolReachable -ToolName $t.Name -VersionCommand "$($t.Name) --version"
        if ($check.Ok) {
            Write-Host "  $($t.Name): OK ($($check.Detail))" -ForegroundColor DarkGray
        } else {
            Write-Host "  $($t.Name): FAIL -- $($check.Detail)" -ForegroundColor Yellow
            $preflightFailures += $t.Name
        }
    }
    if ($preflightFailures.Count -gt 0) {
        Write-Host ""
        Write-Host "WARNING: preflight failed for: $($preflightFailures -join ', ')" -ForegroundColor Yellow
        Write-Host "  Common causes: (1) CLI not installed; (2) CLI not on PATH; (3) for codex specifically, expired subscription or exhausted API tokens." -ForegroundColor DarkGray
        Write-Host "  If you continue, those tools will produce empty output dirs and the judge will mark all criteria SKIP." -ForegroundColor DarkGray
        $resp = Read-Host "Continue with the rest? [y/N]"
        if ($resp -notmatch '^[Yy]') {
            Write-Host "Aborting start phase." -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
```

- [ ] **Step 4.3: Smoke-test (happy path)**

```powershell
.\benchmarks\scripts\bench-run.ps1 -Phase start -Benchmark markdown-editor -RunId preflight-smoketest
```
Expected: prints `Preflight: verifying...`, prints one OK line per tool, then proceeds with baseline capture and the usual per-tool launch instructions. If any tool actually fails on your machine, confirm the [y/N] prompt appears and that pressing `n` aborts cleanly.

Cleanup:
```powershell
Remove-Item -Recurse -Force benchmarks\runs\preflight-smoketest -ErrorAction SilentlyContinue
```

- [ ] **Step 4.4: Smoke-test (failure path)**

Temporarily rename one tool's binary directory or modify `$Tools` in the script to include a bogus tool. Re-run start. Confirm the FAIL line prints and the [y/N] prompt appears. Revert the temporary change.

- [ ] **Step 4.5: Commit**

```powershell
git add benchmarks/scripts/bench-run.ps1
git commit -m "bench-run: add CLI preflight to start phase (catches codex token exhaustion before the run window)"
```

---

## Task 5: Document Config v4 in benchmarks/README.md

Update the iteration-lineage section so the v4 changes are auditable alongside v1/v2/v3.

**Files:**
- Modify: `benchmarks/README.md` ("How we've iterated the opencode config" section, after the Config v3 bullet)

- [ ] **Step 5.1: Add the Config v4 bullet**

Find the Config v3 bullet (it starts with `- **Config v3 (template-driven README + Playwright MCP)**`). After its closing sentence, add a new bullet:

```
- **Config v4 (scored README rubric + explicit Playwright smoke-test + CLI preflight)**: three changes informed by `markdown-editor` run `2026-05-24-0758`. (1) Documentation becomes a counted 0-5 rubric inside `SPEC.md` and `JUDGE-PROMPT.md` (one point per required README section) so the score is mechanical and the agent's quality grade visibly depends on README depth, rather than a prompt-side instruction the agent can ignore. (2) The opencode build-agent prompt now requires an explicit five-step Playwright MCP smoke-test for every HTML deliverable (navigate / snapshot / type / console-check / non-empty assertion), with no wiggle room and explicit instructions to HALT if the MCP is unavailable -- targets the class of bug claude shipped in run 3 (a `</script>` literal inside inline JS that killed runtime rendering, undetected by source-code review). (3) `bench-run.ps1` start phase now runs a CLI version-check preflight against each configured tool and prompts before proceeding if any tool is unreachable -- closes the silent codex token-exhaustion failure mode that wasted a run-3 data point. Hypothesis being tested for the next markdown-editor run: a scored rubric closes the documentation gap that two prompt-side iterations could not; the explicit smoke-test catches `</script>`-class bugs before claude can ship them; the preflight prevents the codex skip from recurring.
```

- [ ] **Step 5.2: Commit**

```powershell
git add benchmarks/README.md
git commit -m "benchmarks README: document Config v4 (scored README rubric + Playwright smoke-test + CLI preflight)"
```

---

## Self-review

1. **Spec coverage:** Plan covers all three user-approved changes (scored README rubric, tighter verification, codex preflight) and adds the documentation update so the lineage stays auditable. No spec requirement is unaddressed.
2. **Placeholder scan:** No TBD / TODO / "add appropriate" / "similar to" placeholders. Every step contains exact text or exact commands.
3. **Type consistency:** Rubric section enumeration (sections 1-5) is identical between Task 1 (SPEC.md) and Task 2 (JUDGE-PROMPT.md). Score range is 0-5 in both. Helper function name `Test-ToolReachable` is used consistently in Task 4.
4. **Independence:** Each task is independently committable. If you stop after Task 1, SPEC.md is internally consistent but JUDGE-PROMPT.md still uses the old rubric -- the next benchmark run will favor JUDGE-PROMPT.md (the judge reads that file). For correctness, ship Tasks 1 + 2 together if you split the work over time.
5. **Risk:** Task 3's JSON edit is the highest-risk single change because a stray unescaped `"` will break opencode startup. The Step 3.3 + 3.4 validation catches this. If validation fails, revert the file with `git checkout opencode.example.json` and retry the edit with cleaner escaping.

---

## Execution

Two execution options:

1. **Subagent-Driven (recommended)** -- dispatch a fresh subagent per task, review between tasks. Best for catching the JSON-escaping risk in Task 3 in isolation.
2. **Inline Execution** -- run all five tasks in one session with a checkpoint after Tasks 2 and 4.

Recommendation: subagent-driven, single subagent per task, model `sonnet` for Tasks 1/2/3/5 (text edits) and `sonnet` for Task 4 (PowerShell). Eric reviews diffs between each.
