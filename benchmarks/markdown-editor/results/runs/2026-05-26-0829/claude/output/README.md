# Markdown Editor

A single-file, self-contained markdown editor with live preview and XSS-safe rendering.

## Open the editor

Double-click `markdown.html` or open it in any modern browser. It runs from `file://` with no network requests and no install.

The page has two panes: a textarea on the left and the rendered preview on the right. The preview refreshes ~150 ms after the last keystroke (well under the 250 ms budget).

## Run tests

```sh
node --test markdown.test.js
```

Requires Node.js 18+. No npm install needed — the tests use `node:test` and `node:vm` from the standard library only.

The test harness extracts the parser from `markdown.html` via sentinel comments (`/* PARSER_START */ ... /* PARSER_END */`) and evaluates it in a `vm.createContext` sandbox.

## Supported markdown

- ATX headings `#` through `######`
- Bold `**text**`
- Italic `*text*` and `_text_`
- Bold+italic `***text***`
- Unordered lists with `-`, `*`, or `+` markers (one level of nesting via 2-space indent)
- Ordered lists `1. item`
- Inline code `` `code` ``
- Fenced code blocks ` ``` `
- Inline links `[text](url)` — URLs limited to `http`, `https`, `mailto`, fragments, and relative paths
- Blockquotes `> line`

## Not implemented

- Setext (underline) headings
- Reference-style links
- Images
- Tables
- HTML passthrough
- Task lists
- Strikethrough
- More than one level of list nesting

## Security approach

Hand-rolled, no sanitizer library. The strategy in order:

1. **Strip dangerous control chars** from input (`\x00`–`\x08`, `\x0B`, `\x0C`, `\x0E`–`\x1F`) so the parser's internal placeholder markers (`\x01` / `\x02`) cannot be smuggled in by user input.
2. **Escape-first**: HTML-escape the entire input (`&`, `<`, `>`, `"`, `'`) up front, so any raw HTML the user types becomes inert text.
3. **Placeholder stashing**: fenced code blocks, inline code spans, and link constructs are extracted into placeholder tokens (using stripped ASCII control chars as boundaries) before later passes, so emphasis operators cannot rewrite their bodies and link URLs cannot be mangled by markdown rules.
4. **URL allowlist**: link `href` values must match `http`, `https`, `mailto`, a fragment, a query string, or a relative path. Anything else (`javascript:`, `data:`, `vbscript:`, `file:`, including mixed-case variants) is rewritten to `#`.
5. **No raw HTML passthrough**: any `<...>` from the source is already escaped at step 2 — the parser never re-emits user-provided tags.

Tested against `<script>`, `<img onerror=...>`, `javascript:` URLs (including uppercase), `vbscript:`, `data:` URLs, null-byte smuggling, image-syntax with dangerous URLs, and direct placeholder-marker injection. See `markdown.test.js` for the full XSS regression suite.
