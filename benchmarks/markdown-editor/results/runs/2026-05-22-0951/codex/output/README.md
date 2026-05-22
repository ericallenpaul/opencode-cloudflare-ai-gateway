# Markdown Editor

## Open the Editor

Open `markdown.html` directly in a browser. It is a self-contained file and runs from a `file://` URL.

## Run Tests

```sh
node --test markdown.test.js
```

No npm install or build step is required.

## Implemented Markdown Subset

- ATX headings, `#` through `######`
- Bold with `**text**`
- Italic with `*text*` and `_text_`
- Bold plus italic with `***text***`
- Unordered lists using `-`, `*`, or `+`, with one nested level by indentation
- Ordered lists using `1.`, `2.`, and so on
- Inline code with backticks
- Fenced code blocks with triple backticks
- Inline links with `[text](url)`
- Blockquotes with `>` lines
- Paragraphs separated by blank lines

## Not Implemented

- Raw HTML passthrough
- Tables
- Images
- Reference-style links
- Setext headings
- Task lists
- Multiple nested list levels beyond the required single level
- Markdown escapes for every CommonMark edge case
- Syntax highlighting for code fences

## Security Approach

The editor does not use a sanitizer library. It uses hand-rolled escaping and a small allowlist renderer:

- User text is escaped before it is inserted into the preview.
- The renderer emits only known tags for the supported Markdown subset.
- Raw HTML remains text, so `<script>` and `<img onerror=...>` do not become active elements.
- Link URLs are filtered before rendering. `http:`, `https:`, `mailto:`, relative URLs, and hash URLs are allowed; `javascript:`, `data:`, protocol-relative URLs, and unknown schemes are rendered as empty `href` values.
