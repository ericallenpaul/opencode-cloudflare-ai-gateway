# Markdown Editor -- canonical benchmark prompt

This is the prompt fed verbatim to each tool. **Do not paraphrase or adjust per-tool** -- the whole point is that the same input goes to each tool. Copy the block below and paste it into the agent.

---

```text
Build a self-contained markdown editor as a single HTML file in this directory.

Requirements:
- Dual-pane layout: a textarea on the left for markdown input and a live-rendered HTML preview on the right
- Preview updates within ~250ms of any keystroke (live preview, not a manual "render" button)
- Supports: ATX headings (# through ######), bold (**text**), italic (*text* and _text_), bold+italic (***text***), unordered lists (-, *, +) with one level of nesting, ordered lists, inline code (backticks), fenced code blocks (triple backticks), inline links ([text](url)), and blockquotes (> lines)
- XSS-safe: raw <script> tags, <img onerror=...>, and javascript: URLs must NOT execute and must NOT produce active HTML in the preview
- Inline CSS and JavaScript only -- no external dependencies, no build step, no npm
- The HTML file must open and run from disk (file:// URL) with no network requests
- Include unit tests for the markdown parsing and rendering logic that I can run from the command line with a single command, with no install step required beyond what comes with Node.js (i.e. node --test or similar built-in)

The requirements above are intentionally fully specified for benchmarking purposes. Do NOT pause for clarifying questions, ambiguity exploration, or plan approval. Do NOT create a separate implementation-plan document unless your CLI requires one internally. Proceed directly to implementation, tests, and local verification.

Keep the run bounded:
- Do not use external dependencies, package installs, web research, or generated planning documents.
- Do not create files outside the current benchmark workspace.
- Run the command-line tests you create before finishing.
- Do not use browser automation, Playwright MCP, or manual browser smoke tests during generation; the benchmark harness will perform deterministic browser judging afterward.

Deliverables when complete:
- The HTML file (call it `markdown.html`)
- The test file(s) (call them `markdown.test.js` or similar)
- A brief README.md explaining: how to open the editor, how to run the tests, what markdown subset is implemented, what is NOT implemented, and what security approach was used (sanitizer library, hand-rolled escaping, etc.)
```
