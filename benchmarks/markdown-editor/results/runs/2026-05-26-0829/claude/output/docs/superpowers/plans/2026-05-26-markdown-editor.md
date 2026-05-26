# Self-Contained Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-file `markdown.html` markdown editor with live preview, XSS-safe rendering, plus Node-based unit tests.

**Architecture:** One self-contained HTML file with inline CSS and JS. The markdown parser is a pure function `parseMarkdown(src)` exposed on `window` for use by the page and extracted via `vm` by the test harness. Parser is escape-first: HTML-escape the entire input up front, then apply syntactic transformations on the escaped string, using ASCII control-char placeholders to stash protected sequences (code spans, fenced code blocks, link text+href) so later passes cannot rewrite them. URL allowlist (http/https/mailto/relative + #anchors) rejects `javascript:`, `data:`, `vbscript:`. Tests run via `node --test` against the parser extracted from the HTML.

**Tech Stack:** Vanilla JS, HTML, CSS. Node.js built-in `node:test` and `node:vm` for tests. No npm install required.

---

## File Structure

- `markdown.html` — single-file editor (HTML + inline CSS + inline JS with `parseMarkdown` parser)
- `markdown.test.js` — Node test file that extracts `parseMarkdown` from `markdown.html` via `vm` and asserts behavior
- `README.md` — usage + test instructions + security approach

---

## Task 1: Project scaffold and parser hook

**Files:**
- Create: `markdown.html`
- Create: `markdown.test.js`

- [ ] **Step 1: Write failing test that extracts and calls `parseMarkdown`**

`markdown.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'markdown.html'), 'utf8');
const match = html.match(/\/\* PARSER_START \*\/([\s\S]*?)\/\* PARSER_END \*\//);
if (!match) throw new Error('Parser sentinels not found in markdown.html');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(match[1] + '\nthis.parseMarkdown = window.parseMarkdown;', ctx);
const parseMarkdown = ctx.parseMarkdown;

test('parseMarkdown is a function', () => {
  assert.strictEqual(typeof parseMarkdown, 'function');
});

test('empty string produces empty output', () => {
  assert.strictEqual(parseMarkdown(''), '');
});

module.exports = { parseMarkdown };
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test markdown.test.js`
Expected: FAIL — `markdown.html` does not exist.

- [ ] **Step 3: Create minimal `markdown.html` with sentinel-wrapped parser stub**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Markdown Editor</title>
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
  .app { display: flex; height: 100vh; }
  .pane { flex: 1; padding: 12px; overflow: auto; box-sizing: border-box; }
  textarea#src { width: 100%; height: 100%; box-sizing: border-box; font-family: ui-monospace, Consolas, monospace; font-size: 14px; resize: none; border: 1px solid #ccc; padding: 8px; }
  #preview { border: 1px solid #ccc; background: #fff; padding: 8px; }
  #preview pre { background: #f4f4f4; padding: 8px; overflow: auto; }
  #preview code { background: #f4f4f4; padding: 0 4px; font-family: ui-monospace, Consolas, monospace; }
  #preview blockquote { border-left: 4px solid #ccc; margin: 0; padding: 4px 12px; color: #555; }
</style>
</head>
<body>
<div class="app">
  <div class="pane"><textarea id="src" placeholder="Type markdown here..."></textarea></div>
  <div class="pane"><div id="preview"></div></div>
</div>
<script>
/* PARSER_START */
(function (root) {
  function parseMarkdown(src) {
    if (!src) return '';
    return '';
  }
  root.parseMarkdown = parseMarkdown;
})(typeof window !== 'undefined' ? window : this);
/* PARSER_END */

(function () {
  var src = document.getElementById('src');
  var preview = document.getElementById('preview');
  var t = null;
  function render() { preview.innerHTML = window.parseMarkdown(src.value); }
  src.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(render, 150);
  });
  render();
})();
</script>
</body>
</html>
```

- [ ] **Step 4: Run test to verify both tests pass**

Run: `node --test markdown.test.js`
Expected: PASS 2/2.

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): scaffold editor + parser test harness"
```

---

## Task 2: HTML-escape baseline (XSS foundation)

**Files:**
- Modify: `markdown.html` (parser body)
- Modify: `markdown.test.js`

- [ ] **Step 1: Add failing XSS-escape tests to `markdown.test.js`**

Append:
```js
test('escapes raw <script> tags', () => {
  const out = parseMarkdown('<script>alert(1)</script>');
  assert.ok(!/<script>/i.test(out), 'must not contain <script>');
  assert.ok(out.includes('&lt;script&gt;'));
});

test('escapes <img onerror=...>', () => {
  const out = parseMarkdown('<img src=x onerror=alert(1)>');
  assert.ok(!/<img/i.test(out));
  assert.ok(out.includes('&lt;img'));
});

test('escapes ampersands once', () => {
  const out = parseMarkdown('A & B');
  assert.ok(out.includes('A &amp; B'));
});

test('escapes quotes', () => {
  const out = parseMarkdown('"hello" \'world\'');
  assert.ok(out.includes('&quot;hello&quot;'));
  assert.ok(out.includes('&#39;world&#39;'));
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `node --test markdown.test.js`
Expected: 4 new tests FAIL.

- [ ] **Step 3: Implement escape-first parser body**

Replace the parser body inside the sentinel block:
```js
(function (root) {
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
  }
  function stripControl(s) {
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  function parseMarkdown(src) {
    if (src == null || src === '') return '';
    var s = stripControl(String(src));
    s = escapeHtml(s);
    // Wrap as a single paragraph until later tasks add block handling.
    return '<p>' + s + '</p>';
  }
  root.parseMarkdown = parseMarkdown;
  root.__mdInternals = { escapeHtml: escapeHtml, stripControl: stripControl };
})(typeof window !== 'undefined' ? window : this);
```

Also update the existing `empty string` test if needed — `parseMarkdown('')` still returns `''` because of the guard.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test markdown.test.js`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): escape-first XSS baseline"
```

---

## Task 3: ATX headings

**Files:**
- Modify: `markdown.html`
- Modify: `markdown.test.js`

- [ ] **Step 1: Add failing heading tests**

```js
test('# H1 produces <h1>', () => {
  assert.ok(parseMarkdown('# Hello').includes('<h1>Hello</h1>'));
});
test('###### H6 produces <h6>', () => {
  assert.ok(parseMarkdown('###### Six').includes('<h6>Six</h6>'));
});
test('####### (7 hashes) is NOT a heading', () => {
  const out = parseMarkdown('####### Nope');
  assert.ok(!/<h[1-7]>/.test(out));
});
test('heading does not bleed across blank line', () => {
  const out = parseMarkdown('# A\n\nB');
  assert.ok(out.includes('<h1>A</h1>'));
  assert.ok(/<p>B<\/p>/.test(out));
});
```

- [ ] **Step 2: Run tests, confirm fail**

Run: `node --test markdown.test.js`

- [ ] **Step 3: Implement block tokenizer with heading support**

Replace `parseMarkdown` body with a block-aware version. Tokenize by blank lines, then per-block detect heading vs paragraph:

```js
function parseMarkdown(src) {
  if (src == null || src === '') return '';
  var s = stripControl(String(src));
  s = escapeHtml(s);
  // Normalize newlines
  s = s.replace(/\r\n?/g, '\n');
  var blocks = s.split(/\n{2,}/);
  var out = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b === '') continue;
    var m = /^(#{1,6}) +(.*)$/.exec(b);
    if (m && m[0] === b) {
      out.push('<h' + m[1].length + '>' + m[2] + '</h' + m[1].length + '>');
      continue;
    }
    out.push('<p>' + b.replace(/\n/g, '<br>') + '</p>');
  }
  return out.join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `node --test markdown.test.js`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): ATX headings h1-h6"
```

---

## Task 4: Fenced code blocks (triple backticks) — must escape and skip inline passes

**Files:** modify both

- [ ] **Step 1: Add failing tests**

```js
test('fenced code block wraps in <pre><code>', () => {
  const out = parseMarkdown('```\nlet x = 1;\n```');
  assert.ok(/<pre><code>let x = 1;\n?<\/code><\/pre>/.test(out));
});
test('fenced code preserves <script> as escaped text', () => {
  const out = parseMarkdown('```\n<script>alert(1)</script>\n```');
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(!/<script>/i.test(out));
});
test('fenced code is not processed for emphasis', () => {
  const out = parseMarkdown('```\n**bold**\n```');
  assert.ok(out.includes('**bold**'));
  assert.ok(!/<strong>/.test(out));
});
```

- [ ] **Step 2: Run tests, confirm fail**

- [ ] **Step 3: Implement fenced code extraction BEFORE block split**

Strategy: extract fenced blocks first into placeholders before splitting/escaping inline. Since we already escape-first, instead detect fences after escaping and stash content into a placeholder map. Update parser:

```js
function parseMarkdown(src) {
  if (src == null || src === '') return '';
  var s = stripControl(String(src));
  s = s.replace(/\r\n?/g, '\n');

  // Stash fenced code blocks BEFORE escaping the rest — we still escape their
  // content, but we don't want them split by the block tokenizer.
  var fences = [];
  s = s.replace(/```[^\n]*\n([\s\S]*?)\n?```/g, function (_m, body) {
    fences.push('<pre><code>' + escapeHtml(body) + '</code></pre>');
    return '\x01F' + (fences.length - 1) + '\x02';
  });

  s = escapeHtml(s);
  // Restore fence placeholders (they were escaped, unescape the markers).
  s = s.replace(/\x01F(\d+)\x02/g, function (_m, i) { return fences[+i]; });

  var blocks = s.split(/\n{2,}/);
  var out = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b === '') continue;
    if (/^<pre><code>[\s\S]*<\/code><\/pre>$/.test(b)) { out.push(b); continue; }
    var m = /^(#{1,6}) +(.*)$/.exec(b);
    if (m && m[0] === b) {
      out.push('<h' + m[1].length + '>' + m[2] + '</h' + m[1].length + '>');
      continue;
    }
    out.push('<p>' + b.replace(/\n/g, '<br>') + '</p>');
  }
  return out.join('\n');
}
```

Note: the placeholder markers `\x01` and `\x02` are ASCII control chars that `stripControl` removes from user input, so they cannot collide with user content.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): fenced code blocks with XSS-safe escape"
```

---

## Task 5: Blockquotes

**Files:** modify both

- [ ] **Step 1: Add failing tests**

```js
test('> line produces <blockquote>', () => {
  const out = parseMarkdown('> quoted');
  assert.ok(/<blockquote>[\s\S]*quoted[\s\S]*<\/blockquote>/.test(out));
});
test('multi-line blockquote merges', () => {
  const out = parseMarkdown('> a\n> b');
  assert.ok(/<blockquote>[\s\S]*a[\s\S]*b[\s\S]*<\/blockquote>/.test(out));
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement blockquote handling in the block loop**

Add before the heading check inside the block loop:
```js
if (/^&gt; /.test(b) || /^&gt;$/.test(b)) {
  var lines = b.split('\n').map(function (ln) {
    return ln.replace(/^&gt; ?/, '');
  });
  out.push('<blockquote><p>' + lines.join('<br>') + '</p></blockquote>');
  continue;
}
```

Note: `>` was escaped to `&gt;` in the escape pass; match against the escaped form.

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): blockquotes"
```

---

## Task 6: Unordered lists with one level of nesting

**Files:** modify both

- [ ] **Step 1: Add failing tests**

```js
test('unordered list with - markers', () => {
  const out = parseMarkdown('- a\n- b');
  assert.ok(/<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/.test(out));
});
test('unordered list accepts * and +', () => {
  assert.ok(/<ul>/.test(parseMarkdown('* a\n* b')));
  assert.ok(/<ul>/.test(parseMarkdown('+ a\n+ b')));
});
test('one level of nesting via 2-space indent', () => {
  const out = parseMarkdown('- a\n  - a1\n- b');
  // Outer list with one nested list inside the first item
  assert.ok(/<ul>\s*<li>a\s*<ul>\s*<li>a1<\/li>\s*<\/ul>\s*<\/li>\s*<li>b<\/li>\s*<\/ul>/.test(out));
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement list handler**

Add a helper inside the IIFE, above `parseMarkdown`:
```js
function renderUList(block) {
  var lines = block.split('\n');
  var html = '<ul>';
  var inNested = false;
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    var top = /^[-*+] +(.*)$/.exec(ln);
    var nested = /^  [-*+] +(.*)$/.exec(ln);
    if (top) {
      if (inNested) { html += '</ul></li>'; inNested = false; }
      // Look ahead: is next line nested under this?
      if (i + 1 < lines.length && /^  [-*+] +/.test(lines[i + 1])) {
        html += '<li>' + top[1] + '<ul>';
        inNested = true;
      } else {
        html += '<li>' + top[1] + '</li>';
      }
    } else if (nested && inNested) {
      html += '<li>' + nested[1] + '</li>';
    }
  }
  if (inNested) html += '</ul></li>';
  html += '</ul>';
  return html;
}
function isUList(b) {
  return /^[-*+] +/.test(b.split('\n')[0]);
}
```

And in the block loop (after blockquote, before heading or merged with paragraph fallback):
```js
if (isUList(b)) { out.push(renderUList(b)); continue; }
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): unordered lists with 1-level nesting"
```

---

## Task 7: Ordered lists

**Files:** modify both

- [ ] **Step 1: Add failing test**

```js
test('ordered list renders <ol><li>', () => {
  const out = parseMarkdown('1. one\n2. two\n3. three');
  assert.ok(/<ol>\s*<li>one<\/li>\s*<li>two<\/li>\s*<li>three<\/li>\s*<\/ol>/.test(out));
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement ordered list**

Add helpers:
```js
function renderOList(block) {
  var lines = block.split('\n');
  var html = '<ol>';
  for (var i = 0; i < lines.length; i++) {
    var m = /^\d+\. +(.*)$/.exec(lines[i]);
    if (m) html += '<li>' + m[1] + '</li>';
  }
  html += '</ol>';
  return html;
}
function isOList(b) { return /^\d+\. +/.test(b.split('\n')[0]); }
```

Add in the block loop:
```js
if (isOList(b)) { out.push(renderOList(b)); continue; }
```

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): ordered lists"
```

---

## Task 8: Inline formatting (bold, italic, bold+italic, inline code, links) with XSS safety

**Files:** modify both

- [ ] **Step 1: Add failing tests**

```js
test('**bold** → <strong>', () => {
  assert.ok(/<strong>bold<\/strong>/.test(parseMarkdown('**bold**')));
});
test('*italic* → <em>', () => {
  assert.ok(/<em>italic<\/em>/.test(parseMarkdown('*italic*')));
});
test('_italic_ → <em>', () => {
  assert.ok(/<em>italic<\/em>/.test(parseMarkdown('_italic_')));
});
test('***bolditalic*** → <strong><em>', () => {
  const out = parseMarkdown('***hi***');
  assert.ok(/<strong><em>hi<\/em><\/strong>/.test(out));
});
test('`code` → <code>', () => {
  assert.ok(/<code>x<\/code>/.test(parseMarkdown('`x`')));
});
test('inline code escapes HTML', () => {
  const out = parseMarkdown('`<script>`');
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(!/<script>/i.test(out));
});
test('inline code is not emphasized', () => {
  const out = parseMarkdown('`**not bold**`');
  assert.ok(out.includes('**not bold**'));
  assert.ok(!/<strong>/.test(out));
});
test('inline link with safe URL', () => {
  const out = parseMarkdown('[click](https://example.com)');
  assert.ok(/<a href="https:\/\/example\.com">click<\/a>/.test(out));
});
test('javascript: URL is neutralized', () => {
  const out = parseMarkdown('[x](javascript:alert(1))');
  assert.ok(!/href="javascript:/i.test(out));
  // Renders as text or with href="#" — just must not execute
  assert.ok(!/javascript:alert/i.test(out) || /href="#"/i.test(out));
});
test('data: URL is neutralized', () => {
  const out = parseMarkdown('[x](data:text/html,<script>alert(1)</script>)');
  assert.ok(!/href="data:/i.test(out));
});
test('relative URL allowed', () => {
  const out = parseMarkdown('[x](/foo/bar)');
  assert.ok(/href="\/foo\/bar"/.test(out));
});
test('link text can contain emphasis but href is not parsed for it', () => {
  const out = parseMarkdown('[**bold link**](https://e.com)');
  assert.ok(/<a href="https:\/\/e\.com"><strong>bold link<\/strong><\/a>/.test(out));
});
```

- [ ] **Step 2: Run, fail**

- [ ] **Step 3: Implement inline pass with placeholder stashing**

Inside the IIFE, add:
```js
function isSafeUrl(url) {
  // url is HTML-escaped at this point (e.g., &amp; for &). Decode just enough
  // to check the scheme.
  var probe = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Reject control chars or whitespace at start.
  probe = probe.replace(/^[\s\x00-\x1F]+/, '');
  if (/^(javascript|data|vbscript|file):/i.test(probe)) return false;
  if (/^(https?:|mailto:)/i.test(probe)) return true;
  if (/^[\/#?]/.test(probe)) return true; // relative / fragment / query
  if (/^[\w./-]+$/.test(probe)) return true; // bare relative path
  return false;
}

function inline(s) {
  var codes = [];
  // 1) inline code spans — escape content fully, stash as placeholder
  s = s.replace(/`([^`\n]+)`/g, function (_m, c) {
    codes.push('<code>' + c + '</code>');
    return '\x01C' + (codes.length - 1) + '\x02';
  });

  // 2) links — stash before emphasis so URL is not mangled
  var links = [];
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_m, text, url) {
    var safe = isSafeUrl(url) ? url : '#';
    // Recurse for emphasis inside link text (codes already stashed).
    var inner = emphasize(text);
    links.push('<a href="' + safe + '">' + inner + '</a>');
    return '\x01L' + (links.length - 1) + '\x02';
  });

  // 3) emphasis on remaining text
  s = emphasize(s);

  // 4) restore links then codes
  s = s.replace(/\x01L(\d+)\x02/g, function (_m, i) { return links[+i]; });
  s = s.replace(/\x01C(\d+)\x02/g, function (_m, i) { return codes[+i]; });
  return s;
}

function emphasize(s) {
  // Bold+italic first (3 stars), then bold (2), then italic (1 star or 1 underscore).
  s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>');
  return s;
}
```

Then apply `inline(...)` to each text-bearing block content right before pushing. Update the block loop:

- For headings: `out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>');`
- For paragraphs: `out.push('<p>' + inline(b).replace(/\n/g, '<br>') + '</p>');`
- For blockquotes: apply `inline` to each line before joining.
- For lists: apply `inline` to each `<li>` text.

Make sure list helpers call `inline`:
```js
// In renderUList and renderOList, wrap captured text with inline(...)
// e.g., html += '<li>' + inline(top[1]) + '</li>';
```

- [ ] **Step 4: Run tests, expect all pass**

Run: `node --test markdown.test.js`

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat(md): inline emphasis, code, safe links"
```

---

## Task 9: Comprehensive XSS regression tests + edge cases

**Files:** modify `markdown.test.js`

- [ ] **Step 1: Add failing/passing regression tests**

```js
test('img onerror in body becomes inert text', () => {
  const out = parseMarkdown('![x](javascript:alert(1))');
  // We don't implement image syntax — must render as escaped text, not a tag.
  assert.ok(!/<img/i.test(out));
});
test('control char smuggling: null byte is stripped', () => {
  const out = parseMarkdown('hello world');
  assert.ok(out.includes('helloworld'));
});
test('placeholder collision attack: user types our sentinel', () => {
  const out = parseMarkdown('C0');
  // Sentinels must be stripped before they can collide with internal markers.
  assert.ok(!out.includes('<code>'));
});
test('vbscript: URL neutralized', () => {
  const out = parseMarkdown('[x](vbscript:msgbox)');
  assert.ok(!/href="vbscript:/i.test(out));
});
test('uppercase JAVASCRIPT: URL neutralized', () => {
  const out = parseMarkdown('[x](JAVASCRIPT:alert(1))');
  assert.ok(!/href="JAVASCRIPT:/i.test(out));
});
test('link with quote in URL is escape-safe', () => {
  const out = parseMarkdown('[x](https://e.com/?a="b")');
  // The double-quote inside the URL was escaped to &quot; by the escape pass,
  // which is safe inside an href attribute.
  assert.ok(out.includes('href="https://e.com/?a=&quot;b&quot;"') ||
            !/href="https:\/\/e\.com\/\?a="b""/.test(out));
});
test('mixed block document renders all parts', () => {
  const src = [
    '# Title',
    '',
    'Paragraph with **bold** and *italic*.',
    '',
    '- one',
    '- two',
    '',
    '1. first',
    '2. second',
    '',
    '> quoted',
    '',
    '```',
    'code <here>',
    '```',
    '',
    '[link](https://example.com)'
  ].join('\n');
  const out = parseMarkdown(src);
  assert.ok(/<h1>Title<\/h1>/.test(out));
  assert.ok(/<strong>bold<\/strong>/.test(out));
  assert.ok(/<em>italic<\/em>/.test(out));
  assert.ok(/<ul>[\s\S]*<li>one<\/li>/.test(out));
  assert.ok(/<ol>[\s\S]*<li>first<\/li>/.test(out));
  assert.ok(/<blockquote>/.test(out));
  assert.ok(/<pre><code>code &lt;here&gt;\n?<\/code><\/pre>/.test(out));
  assert.ok(/<a href="https:\/\/example\.com">link<\/a>/.test(out));
});
```

- [ ] **Step 2: Run, address any failures**

If a regression test fails, fix the parser before continuing.

- [ ] **Step 3: Commit**

```bash
git add markdown.test.js markdown.html
git commit -m "test(md): XSS regression + mixed-block coverage"
```

---

## Task 10: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# Markdown Editor

A single-file, self-contained markdown editor with live preview and XSS-safe rendering.

## Open the editor

Double-click `markdown.html` or open it in any modern browser. It runs from `file://` with no network requests and no install.

## Run tests

```sh
node --test markdown.test.js
```

Requires Node.js 18+. No npm install needed — the tests use `node:test` and `node:vm` from the standard library.

## Supported markdown

- ATX headings `#` through `######`
- Bold `**text**`
- Italic `*text*` and `_text_`
- Bold+italic `***text***`
- Unordered lists `-`, `*`, `+` (one level of nesting with 2-space indent)
- Ordered lists `1. item`
- Inline code `` `code` ``
- Fenced code blocks ` ``` `
- Inline links `[text](url)` — URLs limited to `http`, `https`, `mailto`, fragments, and relative paths
- Blockquotes `> line`

## Not implemented

- Setext headings (underline style)
- Reference-style links
- Images
- Tables
- HTML passthrough
- Task lists
- Strikethrough
- More than one level of list nesting

## Security approach

Hand-rolled, no sanitizer library. Strategy:

1. **Strip dangerous control chars** from input (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`) so internal placeholder markers cannot be smuggled in by user input.
2. **Escape-first**: HTML-escape the entire input (`&`, `<`, `>`, `"`, `'`) before any markdown transformation, so any raw HTML the user types becomes inert text.
3. **Placeholder stashing**: fenced code blocks, inline code, and links are extracted into placeholder tokens (using ASCII control chars `\x01`/`\x02`) before later passes so emphasis operators cannot rewrite their bodies.
4. **URL allowlist**: link `href` values are checked against an allowlist (`http`, `https`, `mailto`, fragments, relative paths). Anything else (`javascript:`, `data:`, `vbscript:`, `file:`) is rewritten to `#`.
5. **No raw HTML passthrough**: any `<...>` from the source is already escaped at step 2 — we never re-inject user-provided tags.

Tested against `<script>`, `<img onerror=...>`, `javascript:` URLs (including mixed case), `vbscript:`, `data:` URLs, null-byte smuggling, and direct placeholder-marker injection.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(md): README with usage, tests, security model"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run all tests**

Run: `node --test markdown.test.js`
Expected: all tests pass.

- [ ] **Step 2: Confirm `markdown.html` loads from disk**

Verify in browser via `file://` path. Confirm:
- Typing in textarea updates preview within 250ms (we use a 150ms debounce, well under budget).
- No network requests in devtools.
- Pasting `<script>alert(1)</script>` into the textarea renders as text, not a script.

- [ ] **Step 3: Spec coverage check**

Walk every spec requirement and confirm a corresponding test or implementation:
- Dual-pane layout ✓ (textarea + preview)
- 250ms debounce ✓ (150ms)
- All listed syntax ✓ (Tasks 3-8)
- XSS safety ✓ (Tasks 2, 8, 9)
- Inline-only CSS/JS, no deps, file:// works ✓ (Task 1)
- Tests via single command, no install ✓ (`node --test`)
- Deliverables: `markdown.html`, `markdown.test.js`, `README.md` ✓

Done.
