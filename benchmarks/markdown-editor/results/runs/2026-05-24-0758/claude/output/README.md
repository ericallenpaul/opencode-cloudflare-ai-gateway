# Markdown Editor

Self-contained single-file markdown editor with live preview.

## Open it
Double-click `markdown.html`, or open `file:///.../markdown.html` in any modern browser. No build, no server, no network.

## Run the tests
`node --test markdown.test.js`
Requires Node 18+ (uses built-in `node:test` and `node:assert`). No npm install needed.

## Markdown subset implemented
- ATX headings `#` through `######`
- Bold `**x**`, italic `*x*` and `_x_`, bold+italic `***x***`
- Inline code `` `x` ``
- Fenced code blocks ` ``` ... ``` `
- Inline links `[text](url)`
- Blockquotes `> ...`
- Unordered lists with `-`, `*`, `+` (one level of nesting via 2-space indent)
- Ordered lists `1. ...`
- Paragraphs (blank-line separated)
- HTML escaping of all source text

## NOT implemented
Images, reference-style links, setext headings, tables, task lists, strikethrough, autolinks, hard line breaks (two trailing spaces), inline HTML passthrough, footnotes, multi-level list nesting beyond one, GFM extensions.

## Security approach
Hand-rolled. No third-party sanitizer.
- All source text is HTML-entity-escaped before any transform via `esc()`.
- Inline transforms run on already-escaped text, so raw `<script>`, `<img>`, etc. cannot become active HTML — they show up as literal text in the preview.
- Link URLs pass through `sanitizeUrl()`, which neutralizes `javascript:`, `data:`, and `vbscript:` schemes (case-insensitive, whitespace-tolerant) by rewriting `href` to `#`.
- Inline code content is held aside during inline transforms so payload like `` `**a**` `` stays literal.
- Fenced code content is escaped but never inline-transformed.
