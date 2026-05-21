# Markdown Editor -- acceptance criteria

What "done" looks like for this benchmark target. Used to score each tool's output objectively. Score is "PASS / PARTIAL / FAIL" per criterion plus optional notes.

## Required (must all PASS for the build to count as "complete")

| # | Criterion | How to verify |
|---|---|---|
| R1 | Single `markdown.html` exists, opens from disk, renders dual-pane layout (textarea + preview visible side by side or stacked) | Open via `file://` URL; both panes visible; textarea is editable |
| R2 | Preview updates live within ~250ms of typing in textarea | Type a character; preview reflects change within 250ms |
| R3 | All 6 ATX heading levels (`#` through `######`) render as h1-h6 in the preview | Type 6 lines `# A` through `###### F`; assert h1..h6 present |
| R4 | Bold (`**text**`), italic (`*text*` or `_text_`), and bold+italic (`***text***`) render with `<strong>`, `<em>`, and one nested inside the other | Type each form; assert strong and em elements present |
| R5 | Unordered lists (`-`, `*`, `+`) and ordered lists (`1. 2. 3.`) with one level of nesting via indentation | Type a nested list; assert `ul > li > ul > li` and `ol > li` structure |
| R6 | Inline code (single backticks) renders as `<code>`; fenced code blocks (triple backticks) render as `<pre><code>` | Type both forms; assert correct elements |
| R7 | Inline links `[text](url)` render as `<a href="url">text</a>` | Type a link; assert anchor with correct href |
| R8 | Blockquotes (lines starting `>`) render as `<blockquote>`, including multi-line consecutive quotes | Type a multi-line blockquote; assert blockquote with all content |
| R9 | XSS-safe: raw `<script>`, `<img onerror=...>`, and `javascript:` URLs must NOT execute and must NOT produce active HTML in the preview. Specifically: (a) no script element in the preview DOM, (b) no alert() fires, (c) any `[text](javascript:foo)` link must NOT have an href starting with `javascript:` | Programmatic: feed each XSS vector, assert preview DOM clean and no dialog fires |
| R10 | Tests exist, runnable via `node --test <file>`, all pass | Run the command; exit code 0 |

## Quality dimensions (subjective, 1-5 scale; recorded in notes.md)

These don't count for "complete" but reveal differences between tools beyond raw output:

- **Code readability** -- is the parser structure followable? Are concerns separated (tokenization vs rendering)?
- **Test breadth** -- do the agent-written tests cover XSS? Nested lists? Code-fence variants? Multi-paragraph blockquotes?
- **UX polish** -- visual hierarchy of preview, sensible defaults (monospace for code, indent for nested lists), reasonable scroll behavior, line-wrap in textarea
- **Defensiveness** -- XSS, huge input (paste a 5000-line markdown doc, doesn't freeze), malformed markdown (unclosed code fences, mismatched emphasis markers)
- **Documentation** -- README explains the implemented subset, what's NOT implemented, and states the security model (sanitizer used? hand-rolled escaping? library?)

## What we explicitly DON'T care about for scoring

- Visual design tastes (color choices, font choices, layout style)
- Comments density / code style preferences
- Whether the implementation matches the way *you* would have written it
- Test runner choice (node --test vs vitest vs whatever -- as long as R10 is satisfied)

## What is out of scope (do not score against these)

- GFM extensions: tables, strikethrough, task lists, autolinks, footnotes
- Smart-quote conversion
- Heading IDs / anchor links
- Math / LaTeX
- Diagrams (mermaid, etc.)
- Server-side rendering
- File save/load to disk
- Themes / dark mode toggle (visual taste, not scored)

## Scoring tally

Per tool, report:

- Required: X / 10 passed
- Quality 1-5 averaged across the 5 dimensions
- Plus the cost / time / token metrics

## Why this target was added

Tic-tac-toe was too simple to surface differences between cheap and frontier models -- all three tools passed 10/10 on the first run. Markdown editor raises the bar in two ways: (1) the parser has real complexity (overlapping inline patterns, nesting, fenced blocks), and (2) R9 adds an adversarial correctness property (XSS safety) that requires deliberate handling, not just working code. The goal is a target where a cheap model's output and a frontier model's output diverge enough to be interesting.
