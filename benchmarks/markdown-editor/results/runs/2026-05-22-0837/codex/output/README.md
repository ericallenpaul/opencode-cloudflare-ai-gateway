# Markdown Editor

## Open the editor

Open `markdown.html` directly in a browser. It is a self-contained file with inline CSS and JavaScript, so it runs from a `file://` URL without a build step or network access.

## Run the tests

```bash
node --test markdown.test.js
```

The tests use Node.js built-in modules only.

## Implemented Markdown subset

- ATX headings from `#` through `######`
- Bold with `**text**`
- Italic with `*text*` and `_text_`
- Bold italic with `***text***`
- Unordered lists using `-`, `*`, or `+`, including one nested unordered level
- Ordered lists using `1.`, `2.`, and so on
- Inline code with backticks
- Fenced code blocks with triple backticks
- Inline links with `[text](url)`
- Consecutive blockquote lines starting with `>`

## Not implemented

This is not a CommonMark-complete parser. It does not implement tables, images, reference links, HTML passthrough, nested ordered lists, task lists, hard line breaks, escaped markdown punctuation, link titles, automatic URL linking, or multi-paragraph list items.

## Security approach

The renderer does not use a sanitizer library. It hand-rolls a small safe renderer for the supported subset:

- Source text is HTML-escaped before generated markup is inserted.
- Code blocks and inline code are escaped and never parsed as markdown.
- Raw HTML such as `<script>` and `<img onerror=...>` is shown as text, not active elements.
- Link URLs are normalized before use. Relative URLs, fragments, `http:`, `https:`, `mailto:`, and `tel:` are allowed; `javascript:` and obfuscated variants are rendered as plain link text instead of anchors.

