# Markdown Editor

A self-contained, single-file markdown editor with live preview and XSS-safe rendering.
No build step, no dependencies — open `markdown.html` directly in any modern browser.

## Open the editor

Double-click `markdown.html`, or open it via `file://` URL:

```
file:///path/to/markdown.html
```

No network requests are made; everything (HTML, CSS, parser, preview logic) is inline.

## Run the tests

Requires only Node.js (built-in `node:test` and `node:vm` — no npm install).

```
node --test markdown.test.js
```

The test file extracts the parser from `markdown.html` (delimited by `// PARSER_START`
and `// PARSER_END` markers) and evaluates it inside a Node `vm` context, then runs 23
assertions covering rendering and XSS protection.

## Supported markdown

- ATX headings: `#` through `######`
- Bold: `**text**`
- Italic: `*text*` and `_text_`
- Bold-italic: `***text***`
- Inline code: `` `text` ``
- Fenced code blocks: triple-backtick blocks (optional language label is consumed but ignored)
- Inline links: `[text](url)` with URL allowlist (`http(s)://`, `mailto:`, `#fragment`, root- or simple relative paths)
- Unordered lists: `-`, `*`, `+` with one level of nesting (2- or 3-space indent)
- Ordered lists: `1.`, `2.`, …
- Blockquotes: `> ...` (consecutive lines are grouped; inner content is rendered recursively, so blockquotes may contain other supported elements)
- Hard line breaks between paragraphs via blank line

## Not implemented

The following common markdown features are intentionally out of scope:

- Tables
- Images (`![alt](src)`) — omitted to avoid even sanitized network/file references
- Setext headings (`===` / `---` underline form)
- Reference-style links (`[text][ref]`)
- Autolinks (`<https://example.com>`)
- Footnotes, task lists, strikethrough, definition lists (GFM extensions)
- Heading IDs / anchors
- Nested lists beyond one level
- Raw HTML passthrough — by design, any raw HTML is escaped and rendered as literal text

## Security approach

Hand-rolled HTML-entity escaping, applied **before** any structural markdown transform
touches user text. There is no `innerHTML`-based parsing of user input, no third-party
sanitizer, and no allowlist of HTML tags — because no user-supplied HTML is ever emitted.

Specifically:

1. **HTML entity escape**: `& < > " '` in every user-visible string are replaced with
   their HTML entity equivalents (`escapeHtml`). This is applied to:
   - Plain paragraph text
   - Heading content
   - List item content
   - Blockquote content (recursively)
   - Fenced and inline code block contents (so `<script>` inside a code block renders
     as visible text, not as a tag)
   - Link labels and link URLs (after the URL passes the allowlist)
2. **Link URL allowlist** (`sanitizeUrl`): only `http://`, `https://`, `mailto:`,
   `#fragment`, root-relative (`/...`), or simple relative paths are emitted. Anything
   else (`javascript:`, `data:`, `vbscript:`, `file:`, etc.) is rewritten to `#`.
   Control characters and whitespace inside the URL are stripped before the scheme
   check to prevent smuggling (`java&#9;script:` style attacks).
3. **Inline-code isolation**: backtick-delimited spans are extracted into placeholders
   before emphasis transforms run, so `` `**x**` `` renders as literal `**x**` inside
   `<code>` rather than as bold.
4. **No `eval` / `Function` / `srcdoc`**: the preview pane uses `innerHTML` to insert
   the parser output, but the parser output never contains raw user HTML — only the
   small fixed set of tags it constructs itself (`<h1>`…`<h6>`, `<p>`, `<ul>`, `<ol>`,
   `<li>`, `<blockquote>`, `<pre>`, `<code>`, `<strong>`, `<em>`, `<a>`).

XSS vectors verified by the test suite:

- `<script>alert(1)</script>` → escaped to literal text
- `<img src=x onerror=alert(1)>` → escaped to literal text
- `[x](javascript:alert(1))` → href rewritten to `#`
- `[x](data:text/html,<script>)` → href rewritten to `#`
- `[x](vbscript:msgbox)` → href rewritten to `#`
- `<script>` inside headings, blockquotes, code blocks → escaped in every position
