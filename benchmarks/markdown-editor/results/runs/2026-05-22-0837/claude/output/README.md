# Markdown Editor

A self-contained, single-file markdown editor with live preview. No build step, no dependencies, no network.

## Files

- `markdown.html` — the editor (textarea + live preview pane + inline CSS + inline parser)
- `markdown.test.js` — Node.js unit tests for the parser and the live-preview wiring
- `PLAN.md` — implementation plan
- `README.md` — this file

## How to open the editor

Double-click `markdown.html`, or open it directly in any modern browser via `file://`:

```
file:///<absolute-path>/markdown.html
```

Everything is inline. No network requests are made.

## How to run the tests

Node 18+ (uses the built-in `node:test` runner — no install needed):

```
node --test markdown.test.js
```

Expected: **48 passing, 0 failing**.

The test file loads the parser by extracting the `<script id="parser">` block from `markdown.html` and evaluating it in a `vm` sandbox, so the tests exercise the exact code the browser runs. The wiring test additionally executes the page-level bootstrap script against a fake DOM and a virtual clock to confirm the live-preview debounce fires within the 250 ms budget.

## Markdown subset implemented

| Feature | Syntax |
|---|---|
| Headings | `#` … `######` (ATX, requires a space after the hashes) |
| Bold | `**text**` |
| Italic | `*text*` and `_text_` |
| Bold + italic | `***text***` |
| Inline code | `` `text` `` |
| Fenced code blocks | <code>```</code> … <code>```</code> |
| Inline links | `[text](url)` |
| Blockquotes | `> text` (one or more consecutive lines collapse into one block) |
| Unordered lists | `-`, `*`, `+` (with one level of two-space-indent nesting) |
| Ordered lists | `1.`, `2.`, … (with one level of two-space-indent nesting) |
| Paragraphs | any consecutive non-block lines |

## What is NOT implemented

By design — the brief asked for a focused subset:

- Setext (underline-style) headings
- Reference-style links (`[text][ref]` / `[ref]: url`)
- Images (`![alt](url)`)
- Tables
- Strikethrough, task lists, footnotes, and other GFM extensions
- HTML pass-through (raw HTML in source is escaped; see security note below)
- Autolinks (`<https://example.com>`)
- Horizontal rules (`---`)
- More than one level of list nesting
- Lazy continuation of blockquotes / lists
- Indented (4-space) code blocks — only fenced code blocks are recognized

## Security approach

**Hand-rolled escaping. No sanitizer library.**

The strategy is "escape first, then build HTML from a fixed grammar":

1. The entire input is run through `escapeHtml`, which replaces `&`, `<`, `>`, `"`, and `'` with HTML entities (ampersand first to avoid double-escaping). After this step the input contains no characters that the browser will interpret as HTML.
2. All subsequent block- and inline-level parsing operates on the escaped text. Markdown markers (`#`, `*`, `_`, backticks, brackets, parens, dashes, plus, digits) are ASCII and pass through `escapeHtml` unchanged, so they remain detectable. The blockquote marker `>` is detected as `&gt;` post-escape.
3. The parser never inserts raw user-supplied HTML — every tag in the output (`<p>`, `<h1>`, `<a>`, `<code>`, …) is emitted by the parser itself, with user-supplied substrings inserted only where they have already been escaped.
4. URLs in `[text](url)` are validated against an allowlist of schemes: `http:`, `https:`, `mailto:`, `tel:`, `ftp:`, plus relative URLs (no colon before the first `/`, `?`, or `#`). `javascript:`, `data:`, `vbscript:`, `file:`, and any other scheme are rejected. Rejected links are rendered as the link text only — the dangerous URL is not echoed even as literal text. Because URL validation runs on the already-escaped text, entity-encoded scheme tricks (e.g. `&#x6A;avascript:`) cannot bypass the check — the encoded `&` is itself escaped to `&amp;` and the browser will not decode it inside the URL.
5. The href attribute value is the escaped URL, so attribute-injection via embedded quotes is impossible (`"` is already `&quot;`).

The XSS test cases in `markdown.test.js` cover the standard payloads:

- `<script>alert(1)</script>` → escaped, no script tag in output
- `<img src=x onerror=alert(1)>` → escaped, no img tag in output
- `[click](javascript:alert(1))` → rendered as the text `click`, no anchor
- `[click](JAVASCRIPT:alert(1))` (case variation) → also blocked
- `[click](  javascript:alert(1))` (leading whitespace) → also blocked
- `[click](data:text/html,…)` and `[click](vbscript:…)` → blocked
- `[<script>](https://example.com)` → link text escaped, no script tag

Run the tests to see them all green.
