# Markdown Editor

Self-contained markdown editor in a single HTML file with a hand-rolled,
XSS-safe parser. Tests run on stock Node.js with no install step.

## Files

| File              | Purpose                                                      |
|-------------------|--------------------------------------------------------------|
| `markdown.html`   | The editor. Inline CSS + JS. Open from disk.                 |
| `markdown.test.js`| Node test suite for the parser embedded in `markdown.html`.  |
| `plan.md`         | Implementation plan that produced this code.                 |

## How to open the editor

1. Double-click `markdown.html`, or open it in any modern browser via
   `File -> Open`, or navigate to `file:///.../markdown.html` directly.
2. Type markdown in the left pane. The right pane updates within ~250ms.

No web server is required. There are no network requests, no CDNs, and no
external assets — `view-source:` will show 100% of the code.

## How to run the tests

From this directory:

```
node --test markdown.test.js
```

No `npm install` is needed. The only requirement is a Node version that
includes the built-in `node:test` runner (Node 18+).

The test file reads `markdown.html`, slices out the parser between the
`/* PARSER:START */` and `/* PARSER:END */` comment markers, evaluates it
inside a sandboxed `vm` context, and exercises the resulting
`renderMarkdown(src)` function. This guarantees the tests cover exactly
the parser that ships in the HTML — there is no duplicated copy of the
parser.

Current status: **50 tests, 0 failures.**

## Supported markdown subset

- ATX headings, levels 1–6 (`#` through `######`, space required after the hashes; 7+ hashes is a paragraph)
- Paragraphs separated by blank lines
- Bold: `**text**`, `__text__`
- Italic: `*text*`, `_text_`
- Bold + italic: `***text***`, `___text___`
- Inline code: `` `code` `` (HTML is escaped; further markdown is not processed)
- Fenced code blocks: ```` ``` ```` with optional language tag, e.g. ```` ```js ```` → `<pre><code class="language-js">…</code></pre>`
- Inline links: `[text](url)` with URL-scheme allow-listing (see security)
- Blockquotes: lines starting with `>` (inline markdown is processed)
- Unordered lists: `-`, `*`, or `+` markers, one level of nesting via 2-space indent
- Ordered lists: `1.`, `2.`, … markers, one level of nesting

## NOT implemented

The following are intentionally out of scope for this build:

- Setext-style headings (`===` / `---` underlines)
- Reference-style links and link definitions
- Autolinks (`<https://…>`, `<a@b.com>`)
- Images (`![alt](url)`) — omitted to keep the security model simple
- Horizontal rules (`---`, `***`)
- Tables
- Task lists (`- [ ]`)
- Strikethrough (`~~text~~`)
- Footnotes
- Raw HTML pass-through (deliberate — see security)
- Hard line breaks (two trailing spaces, or `\`)
- Multi-level list nesting (only one level deep is supported)
- Loose vs. tight list distinction

## Security approach

This editor renders untrusted text into a browser DOM, so safety is the
primary design constraint. The approach:

1. **Hand-rolled escaping, no `innerHTML` of raw input.** Every chunk of
   user text passes through `escapeHtml`, which replaces `& < > " '`
   before it is concatenated into the output. The parser only ever
   inserts whitelisted tags (`p`, `h1`–`h6`, `strong`, `em`, `code`,
   `pre`, `a`, `ul`, `ol`, `li`, `blockquote`) into the HTML it emits.
2. **No raw HTML pass-through.** A `<script>` (or anything else) typed
   into the markdown is escaped to `&lt;script&gt;` and rendered as text.
   This means inline HTML formatting (a common markdown feature) is not
   supported by design.
3. **URL allow-list for links.** Link `href` values are validated against
   an allow-list of schemes: `http`, `https`, `mailto`, `tel`, `ftp`.
   Anchors (`#foo`) and relative paths are accepted (no scheme). Anything
   else — `javascript:`, `data:`, `vbscript:`, `file:`, etc. — is
   rewritten to `#`. The check trims leading whitespace and control
   characters and is case-insensitive, so payloads like
   `JaVaScRiPt:` or `   javascript:` are still blocked.
4. **Attribute-safe URL emission.** Even after allow-listing, the URL is
   HTML-escaped when written into the `href` attribute so that an
   embedded `"` cannot break out of the attribute and inject extra
   handlers like `onmouseover=`.
5. **Inline code and fenced code blocks are inert.** Their contents are
   escaped and never re-parsed, so a payload inside backticks or a fenced
   block cannot smuggle in markdown that becomes a tag.
6. **No third-party sanitizer dependency.** Everything is in the single
   HTML file. No DOMPurify, no marked, no remark — the parser itself
   only emits known-safe tags.

The XSS test battery in `markdown.test.js` exercises:

- `<script>` tags
- `<img onerror>` payloads
- `javascript:` URLs (lowercase, mixed case, with leading whitespace)
- `data:` URLs containing scripts
- `vbscript:` URLs
- Attempts to break out of the `href` attribute with embedded quotes

## Live-preview timing

The editor wires a 200ms `setTimeout` debounce on the textarea's `input`
event (see `markdown.html` near the bottom of the file). Combined with a
parser whose worst-case run on the integration-test document is well
under 1ms on a modern laptop, every keystroke is reflected in the
preview pane in roughly 200–210ms — comfortably under the 250ms budget.

## Architecture notes

- `renderMarkdown(src)` is a pure function: same input → same output, no
  mutation of outer state.
- The block parser walks the input line-by-line and dispatches to a
  small set of block handlers (heading, fence, blockquote, list,
  paragraph). Blockquotes recursively invoke `renderMarkdown` on their
  contents, which is how inline markdown inside a quote is processed.
- The inline parser tokenizes code spans and links first so their
  payloads are never re-scanned, then applies emphasis transforms to the
  remaining text runs after escaping.
