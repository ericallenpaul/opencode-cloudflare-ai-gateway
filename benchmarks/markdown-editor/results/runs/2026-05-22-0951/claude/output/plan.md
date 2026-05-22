# Markdown Editor Implementation Plan

> **For agentic workers:** Use TDD - write failing test, make it pass, repeat.

**Goal:** Self-contained markdown editor as single HTML file with dual-pane live preview, plus Node-built-in tests for the parser.

**Architecture:** Hand-rolled markdown parser written as a pure function `renderMarkdown(src) -> safeHtml`. Parser code lives inline in `markdown.html` between two delimiter comments. The test file reads `markdown.html`, extracts the parser code, evaluates it in a sandboxed `vm` context, and exercises it. Security model: escape all HTML by default; whitelist transformations; reject `javascript:` URLs; never emit unescaped user input into attribute or element positions.

**Tech Stack:** Single HTML file (inline CSS+JS, no deps), Node.js built-in `node:test` + `node:assert`, `node:vm` for parser extraction, `node:fs` to read the HTML.

**Deliverables:** `markdown.html`, `markdown.test.js`, `README.md`.

---

## File Structure

- `markdown.html` — single self-contained HTML file. Contains:
  - Inline CSS for dual-pane layout
  - Inline `<script>` with parser between `/* PARSER:START */` and `/* PARSER:END */` markers
  - Inline `<script>` wiring textarea -> 250ms-debounced preview
- `markdown.test.js` — Node test file. Reads `markdown.html`, extracts parser code between markers, runs in `vm`, asserts behavior.
- `README.md` — usage, test command, supported subset, NOT-implemented list, security notes.

---

## Phase 1: Skeleton

### Task 1: HTML skeleton with parser marker block

**Files:**
- Create: `markdown.html`

- [ ] **Step 1:** Write skeleton with dual-pane layout, debounce wiring, and an empty parser function between delimiters that just returns escaped input.

- [ ] **Step 2:** Open file in browser, confirm panes render.

### Task 2: Test harness that extracts parser from HTML

**Files:**
- Create: `markdown.test.js`

- [ ] **Step 1:** Test file reads `markdown.html`, slices content between `/* PARSER:START */` and `/* PARSER:END */`, runs in `vm.createContext`, exposes `renderMarkdown`. Add a smoke test: `renderMarkdown("")` returns `""`.

- [ ] **Step 2:** Run `node --test markdown.test.js` — expect smoke test pass.

---

## Phase 2: Core parser (TDD)

For each feature: write failing test, run, implement, run, commit (mentally — actual commits at end).

### Task 3: HTML escaping baseline

Test: `renderMarkdown("<script>alert(1)</script>")` does NOT contain literal `<script>`. Output contains `&lt;script&gt;`.

Implementation: escape `&`, `<`, `>`, `"`, `'` at tokenize time.

### Task 4: ATX headings (# through ######)

Tests:
- `# H1` -> `<h1>H1</h1>`
- `###### H6` -> `<h6>H6</h6>`
- `####### Not a heading` -> paragraph (>6 hashes)
- `#No space` -> paragraph (requires space after #)

### Task 5: Paragraphs

Test: `"hello\n\nworld"` -> `<p>hello</p>\n<p>world</p>`

### Task 6: Bold, italic, bold+italic

Tests:
- `**bold**` -> `<strong>bold</strong>`
- `*italic*` -> `<em>italic</em>`
- `_italic_` -> `<em>italic</em>`
- `***bi***` -> `<strong><em>bi</em></strong>`
- Unmatched `*foo` stays literal

### Task 7: Inline code

Tests:
- `` `code` `` -> `<code>code</code>`
- `` `<script>` `` -> `<code>&lt;script&gt;</code>`
- Inline code is NOT processed for further markdown

### Task 8: Fenced code blocks

Tests:
- ` ```\nline1\nline2\n``` ` -> `<pre><code>line1\nline2\n</code></pre>`
- Content inside fences is escaped, not parsed
- ` ```js\ncode\n``` ` -> `<pre><code class="language-js">code\n</code></pre>`

### Task 9: Inline links

Tests:
- `[text](https://example.com)` -> `<a href="https://example.com">text</a>`
- `[evil](javascript:alert(1))` -> `<a href="#">evil</a>` (or link text only, no javascript: href)
- `[x](data:text/html,foo)` -> sanitized similarly
- `[x](http://safe.com)` -> kept
- `[x](/relative)` -> kept
- `[x](#anchor)` -> kept
- `[x](mailto:a@b.com)` -> kept
- URL attribute is HTML-attribute-escaped (no breaking out of quotes)

### Task 10: Blockquotes

Test: `"> quoted\n> still quoted"` -> `<blockquote>...</blockquote>` containing the lines (re-parsed for inline rules).

### Task 11: Unordered lists with one level of nesting

Tests:
- `- a\n- b` -> `<ul><li>a</li><li>b</li></ul>`
- `* a\n+ b` -> same (mixed bullets ok at top level)
- Nesting via 2-space indent:
  ```
  - a
    - a1
    - a2
  - b
  ```
  -> `<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>`

### Task 12: Ordered lists

Tests:
- `1. a\n2. b` -> `<ol><li>a</li><li>b</li></ol>`
- One level nesting same rules as unordered

### Task 13: XSS hardening battery

Tests:
- `<img src=x onerror=alert(1)>` -> output does NOT contain literal `<img` or `onerror=` outside of escaped form
- `<a href="javascript:alert(1)">x</a>` raw HTML -> escaped, not active
- `[x](JaVaScRiPt:alert(1))` -> sanitized (case-insensitive)
- Spaces/tabs/newlines in scheme: `[x]( javascript:alert(1))` -> sanitized
- `[x](vbscript:msgbox(1))` -> sanitized

---

## Phase 3: Browser wiring

### Task 14: Live preview with debounce

In `markdown.html`:
- Textarea `oninput` triggers a debounce (clearTimeout/setTimeout, 200ms — leaves ~50ms render budget under the 250ms requirement)
- On fire, set `previewElement.innerHTML = renderMarkdown(textarea.value)`
- Initial render on load

### Task 15: Layout & styling

- CSS flex/grid dual pane, 50/50 split, full viewport height
- Textarea uses monospace, full pane height
- Preview pane scrollable
- Basic typography for rendered HTML

---

## Phase 4: Verify & document

### Task 16: README

Document: open instructions, `node --test markdown.test.js`, supported subset list, NOT implemented (tables, task lists, HTML pass-through, reference links, autolinks, footnotes, images, hr, setext headings, emphasis intraword edge cases), security approach (hand-rolled escape + URL scheme allowlist; no DOM parsing of user input; inline-code content untouched after escape; fenced blocks untouched after escape).

### Task 17: Verification

- Run `node --test markdown.test.js` — all pass
- Open `file:///.../markdown.html` in browser
- Confirm typing in textarea updates preview within ~250ms
- Paste XSS payload battery into textarea; confirm no alerts fire
