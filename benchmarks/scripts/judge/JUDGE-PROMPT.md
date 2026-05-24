# Benchmark Judge -- qualitative layer ({{BENCHMARK}})

You are evaluating one tool's {{BENCHMARK}} output as part of a coding-agent benchmark.
Your job is the qualitative layer: code quality, UX polish, test coverage depth,
and any bugs the functional tests missed. The functional (R1-R10) layer already ran
automatically. You are NOT running code. You are reading source and screenshots.

---

## Your inputs

_Note: when invoked via `judge-run.ps1`, the placeholders below are pre-substituted in `runs/<RunId>/judge-prompt-<tool>.md` -- open those generated files directly rather than this template._

- **Source code**: `{{REPO_ROOT}}/benchmarks/{{BENCHMARK}}/results/runs/{{RUN_ID}}/{{TOOL}}/output/`
- **Functional results** (already populated):
  `{{REPO_ROOT}}/benchmarks/{{BENCHMARK}}/results/runs/{{RUN_ID}}/{{TOOL}}/_judge-functional.json`
- **Screenshots**:
  `{{REPO_ROOT}}/benchmarks/{{BENCHMARK}}/results/runs/{{RUN_ID}}/{{TOOL}}/_screenshots/`
  (empty.png, mid-game.png, win.png, mobile.png)
- **Spec**:
  `{{REPO_ROOT}}/benchmarks/{{BENCHMARK}}/SPEC.md`
- **Stub to fill in**:
  `{{REPO_ROOT}}/benchmarks/{{BENCHMARK}}/results/runs/{{RUN_ID}}/{{TOOL}}/judge.md`

---

## What to do

1. **Read** every source file under `output/`. Note: file count, total approximate LOC,
   whether logic and UI are separated, whether there is a README.

2. **Read** `_judge-functional.json`. Note each R1-R10 result and any console/JS errors.

3. **View** the screenshots. Score visual quality and mobile layout.

4. **Re-read** `SPEC.md` to remind yourself what was asked.

5. **Open** `judge.md` and fill in every section described below.
   Do NOT modify any file other than `judge.md`.
   Do NOT run any commands.

---

## Sections to fill in judge.md

### ## R1-R10 results

Copy the status and reason from `_judge-functional.json` for each criterion.
Add a one-line qualitative note where you spotted something the automated test
may have missed (e.g., "win highlight uses color change only -- no animation").

Format:
```
| Criterion | Status | Reason (from functional test) | Qualitative note |
|---|---|---|---|
| R1 | PASS | 9 cells rendered... | Board appears instantly, no flash of unstyled content |
| R2 | ...  | ...                 | ...                                                  |
```

### ## Quality scores (1-5)

Score each dimension on a 1-5 integer scale. One sentence justification each.

Dimensions: Readability, Test breadth, UX polish, Defensiveness, Documentation.

### ## Observations

3-6 bullet points covering:
- What the agent did notably well (be specific)
- Where it fell short or cut corners
- Anything interesting about the implementation approach
- Any bugs you caught that R1-R10 did not flag

### ## Bug list

Concrete bugs found during source review or screenshot inspection.
For each: one-line description, severity (low/medium/high), and which
part of the source it is in.

If no bugs found: write "None found."

---

## Scoring rubric (1-5)

### Readability
- **1**: Hard to follow -- deeply nested callbacks, magic numbers, no comments,
  inconsistent naming.
- **2**: Readable in places but has significant clarity issues (e.g., large monolithic
  function, confusing variable names).
- **3**: Reasonably clear structure; a junior engineer could follow the flow.
  Minor style inconsistencies are fine.
- **4**: Clean separation of concerns, descriptive names, consistent style.
  Would pass code review with minor comments.
- **5**: Exemplary. Pure functions where possible, no side-effect surprises,
  self-documenting names, logical file/module organization.

### Test breadth
- **1**: No tests, or tests that only confirm the file loads.
- **2**: Tests cover the happy path (X wins) but skip edge cases.
- **3**: Tests cover X wins, O wins, draw, and alternation enforcement.
  Corner cases partially covered.
- **4**: Tests also cover: blocked moves on occupied cells, post-win click
  rejection, localStorage persistence, restart behavior.
- **5**: Full coverage including diagonal wins, last-cell-draw, score
  boundary conditions, and DOM structure assertions.

### UX polish
- **1**: Functional but visually raw -- no hover states, no win announcement
  formatting, no mobile consideration.
- **2**: Basic styling but win state is hard to notice; mobile layout broken or
  awkward.
- **3**: Recognizable game UI. Win state clearly announced. Mobile usable.
  Restart button obvious.
- **4**: Win highlight prominent (animation or strong color contrast), score
  area clearly laid out, mobile responsive without overflow.
- **5**: Delightful: meaningful animations, accessible color contrast,
  keyboard navigable, polished mobile layout, clear typographic hierarchy.

### Defensiveness
- **1**: Crashes or behaves incorrectly on: occupied cell click, reload mid-game,
  or localStorage unavailable.
- **2**: Handles the obvious cases but fails on at least one edge: e.g., no
  guard against localStorage quota errors, or post-win clicks modify state.
- **3**: Guards against occupied cells, post-win clicks, and localStorage
  failures. Basic graceful degradation.
- **4**: Handles all of the above plus: double-click race conditions, invalid
  state recovery on reload, localStorage parse errors.
- **5**: Comprehensive. Error boundaries around all external calls,
  immutable state snapshots, no shared mutable global state leakage.

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

---

## Output format

Fill in `judge.md` using EXACTLY this template. Replace all `[...]` placeholders.

```markdown
# Judge: {{TOOL}} -- {{RUN_ID}}

_Generated by judge-run.ps1 + agent qualitative pass pending_
_Evaluated: [date you ran this]_

## R1-R10 results

| Criterion | Status | Reason (functional test) | Qualitative note |
|---|---|---|---|
| R1  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R2  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R3  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R4  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R5  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R6  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R7  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R8  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R9  | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |
| R10 | [PASS/PARTIAL/FAIL/DEFERRED] | [copied from JSON] | [your note] |

**Required passed**: [X] / 10

## Quality scores (1-5)

| Dimension     | Score | Justification                        |
|---|---|---|
| Readability   | [1-5] | [one sentence]                       |
| Test breadth  | [1-5] | [one sentence]                       |
| UX polish     | [1-5] | [one sentence]                       |
| Defensiveness | [1-5] | [one sentence]                       |
| Documentation | [0-5] | [list section numbers present/missing] |

**Average**: [X.X]

## Observations

- [What the agent did notably well -- be specific, e.g. "separated pure game
  logic into a self-contained IIFE exported to globalThis"]
- [Where it fell short -- e.g. "no guard against localStorage being disabled
  in strict file:// contexts on Firefox"]
- [Implementation approach notes -- e.g. "used data-idx attributes for cell
  indexing, making the test file trivially easy to write"]
- [Any surprise findings -- e.g. "includes an undocumented keyboard shortcut"]
- [Optional additional bullet]

## Bug list

| # | Description | Severity | Location |
|---|---|---|---|
| 1 | [brief description] | [low/medium/high] | [file:line or function name] |

_(or "None found.")_
```

---

## Notes on ambiguous cases

- If a functional test returned DEFERRED (R9/R10), check the JSON for the
  orchestrator-resolved result. If still DEFERRED, write that status and note
  "test file not found" or "tests failed" based on what you see in output/.
- If a screenshot is missing (e.g., win.png absent), note it in the
  Observations section.
- PARTIAL is a valid final status for R1-R10 in your table. Do not round up
  to PASS or round down to FAIL -- preserve what the functional layer recorded.
- Score ties between two tools are fine. The benchmark values accuracy over
  differentiation.
