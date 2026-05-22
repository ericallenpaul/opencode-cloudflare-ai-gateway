# Markdown Editor Implementation Plan

**Goal:** Self-contained dual-pane markdown editor in a single HTML file with XSS-safe live preview, plus Node.js unit tests for parser logic.

**Architecture:** Single `markdown.html` with inline CSS/JS. Parser implemented as a pure function exported via UMD-style pattern so it works both in browser (attached to `window`) and Node.js (`module.exports`). Tests import the parser by reading the HTML file and extracting the parser source, or by maintaining the parser in a way that's loadable both ways. Cleanest: write parser as a standalone JS that the HTML embeds via inline `<script>`, but for tests we extract it. Simpler approach: keep the parser as JS inside the HTML, and the test harness uses `vm.runInNewContext` to load the script tag contents. We'll go with that.

**Tech Stack:** HTML5, vanilla JS (no deps), Node.js built-in `node:test` and `node:assert`, `node:fs`, `node:vm`.

**Security approach:** Hand-rolled HTML escaping. ALL text passes through an `escapeHtml` function before becoming preview HTML. URLs are validated against a scheme allowlist (http, https, mailto, relative paths). The parser never inserts raw HTML from the source — all output tags are inserted by the parser itself. No `innerHTML` is set with unescaped user text.

---

## File Structure

- `markdown.html` — the editor (textarea + preview pane + inline CSS + inline JS containing parser)
- `markdown.test.js` — Node.js tests using `node --test`
- `README.md` — usage docs

---

## Task 1: Skeleton HTML + parser stub + extractable script

**Files:**
- Create `markdown.html` with HTML skeleton, dual-pane layout CSS, textarea, preview div, and an inline `<script id="parser-src">` containing a parser stub
- Create `markdown.test.js` that loads the parser source out of the HTML file via regex and runs it in a `vm` sandbox
- Verify the test harness works against a trivial parser stub

## Task 2: Escape HTML (foundation for XSS safety)

Write `escapeHtml(s)` that replaces `&`, `<`, `>`, `"`, `'` with entities.
Tests: `<script>` → `&lt;script&gt;`, ampersand handled first.

## Task 3: Paragraphs (the default block)

Plain text lines become `<p>...</p>`. Blank lines split paragraphs.
Inline content within paragraphs goes through inline parser (initially just escape).

## Task 4: ATX headings

`# ` through `###### ` → `<h1>` through `<h6>`. Reject 7+ hashes (treat as paragraph).

## Task 5: Blockquotes

Lines starting `> ` group into a single `<blockquote>` containing paragraph(s).

## Task 6: Fenced code blocks

```` ``` ```` start/end blocks. Content between fences is escaped, wrapped `<pre><code>...</code></pre>`. Inside fences, no other parsing happens.

## Task 7: Inline code

Backtick-delimited spans → `<code>...</code>` (escaped). Must come BEFORE other inline processing so its content isn't misinterpreted.

## Task 8: Bold, italic, bold+italic

`***x***` → `<strong><em>x</em></strong>`
`**x**` → `<strong>x</strong>`
`*x*` and `_x_` → `<em>x</em>`
Process triple first, then double, then single.

## Task 9: Inline links

`[text](url)` → `<a href="ESCAPED_URL">ESCAPED_TEXT</a>`.
URL validation: allow http://, https://, mailto:, or relative (no scheme). Reject `javascript:`, `data:`, `vbscript:`, etc. Rejected → render as literal text.

## Task 10: Unordered lists (with one level of nesting)

Lines starting `- `, `* `, or `+ ` → `<ul><li>...</li></ul>`. 2-space indent → nested `<ul>` inside the parent `<li>`.

## Task 11: Ordered lists

Lines starting `N. ` → `<ol><li>...</li></ol>`. Same nesting rules.

## Task 12: XSS smoke tests

- Raw `<script>alert(1)</script>` in input → escaped, no script tag in output
- `<img src=x onerror=alert(1)>` → escaped
- `[click](javascript:alert(1))` → rendered as literal text, not a link
- `[click](JAVASCRIPT:alert(1))` (case variation) → also blocked
- ` [click](  javascript:alert(1))` (whitespace) → blocked

## Task 13: HTML wiring — live preview with 250ms debounce

`input` event on textarea schedules a `setTimeout(render, 200)` (under 250ms), clearing any pending timer. Initial render runs once on load.

## Task 14: README

Document open/run/test instructions, supported subset, unsupported features, security approach.

## Task 15: Final verification

- `node --test markdown.test.js` → all pass
- Open `markdown.html` from file:// in a browser, test live preview, paste XSS payloads, confirm they render as text not active HTML
