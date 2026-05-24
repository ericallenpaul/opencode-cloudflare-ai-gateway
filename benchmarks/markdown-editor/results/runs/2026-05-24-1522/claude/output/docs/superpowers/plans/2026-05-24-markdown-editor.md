# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-contained single-file HTML markdown editor with live preview and XSS-safe rendering, plus Node-native unit tests.

**Architecture:** One `markdown.html` containing inline CSS and a hand-rolled markdown parser/renderer in inline `<script>`. Parser is delimited by `// PARSER_START` / `// PARSER_END` markers so `markdown.test.js` can extract it and run inside `node:vm` against `node --test` — no install step beyond Node.js itself. XSS defense is hand-rolled HTML-entity escaping applied to all user text BEFORE any markdown structural transformation, plus URL-scheme allowlist for links.

**Tech Stack:** Plain HTML/CSS/JS (no frameworks), Node.js built-in `node:test` + `node:vm`, no external deps.

---

## File Structure

- `markdown.html` — single-file editor (HTML + inline CSS + inline JS with delimited parser block)
- `markdown.test.js` — extracts parser from `markdown.html`, evaluates in vm, runs `node --test` assertions
- `README.md` — usage, test command, supported/unsupported syntax, security model

---

### Task 1: Scaffold markdown.html with dual-pane layout and live preview wiring

**Files:**
- Create: `markdown.html`

- [ ] **Step 1: Write the failing test for parser extraction**

Add to `markdown.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'markdown.html'), 'utf8');
const m = html.match(/\/\/ PARSER_START([\s\S]*?)\/\/ PARSER_END/);
if (!m) throw new Error('PARSER_START/PARSER_END markers not found in markdown.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.renderMarkdown = renderMarkdown;', ctx);

test('parser exposes renderMarkdown function', () => {
  assert.equal(typeof ctx.renderMarkdown, 'function');
});
```

- [ ] **Step 2: Run test, expect failure (no html file yet)**

Run: `node --test markdown.test.js`
Expected: FAIL (file not found)

- [ ] **Step 3: Create markdown.html skeleton with parser markers**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Markdown Editor</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{display:grid;grid-template-columns:1fr 1fr;height:100vh}
  textarea,.preview{padding:1rem;border:0;outline:0;font-size:14px;height:100%;overflow:auto}
  textarea{font-family:ui-monospace,Consolas,monospace;resize:none;border-right:1px solid #ddd}
  .preview pre{background:#f4f4f4;padding:.5rem;overflow:auto}
  .preview code{background:#f4f4f4;padding:.1em .3em;border-radius:3px}
  .preview blockquote{border-left:4px solid #ccc;margin:0;padding:.25rem .75rem;color:#555}
</style>
</head>
<body>
<div class="wrap">
  <textarea id="src" placeholder="# Type markdown here"></textarea>
  <div class="preview" id="out"></div>
</div>
<script>
// PARSER_START
function renderMarkdown(src){ return ''; }
// PARSER_END

(function(){
  var src = document.getElementById('src');
  var out = document.getElementById('out');
  var t;
  function update(){ out.innerHTML = renderMarkdown(src.value); }
  src.addEventListener('input', function(){
    clearTimeout(t);
    t = setTimeout(update, 150);
  });
  update();
})();
</script>
</body>
</html>
```

- [ ] **Step 4: Run test, expect pass**

Run: `node --test markdown.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "feat: scaffold dual-pane markdown editor with parser markers"
```

---

### Task 2: HTML-escape baseline (XSS foundation)

**Files:**
- Modify: `markdown.html` (parser block)
- Modify: `markdown.test.js`

- [ ] **Step 1: Add failing escape tests**

```js
test('escapes < > & " in plain text', () => {
  const out = ctx.renderMarkdown('a < b & c > d "e"');
  assert.ok(out.includes('&lt;'));
  assert.ok(out.includes('&gt;'));
  assert.ok(out.includes('&amp;'));
  assert.ok(out.includes('&quot;'));
  assert.ok(!out.includes('<b>') && !out.includes('"e"'));
});

test('raw <script> tag does not execute or appear as live HTML', () => {
  const out = ctx.renderMarkdown('<script>alert(1)</script>');
  assert.ok(!/<script/i.test(out));
  assert.ok(out.includes('&lt;script'));
});

test('img onerror is escaped, not rendered', () => {
  const out = ctx.renderMarkdown('<img src=x onerror=alert(1)>');
  assert.ok(!/<img/i.test(out));
  assert.ok(out.includes('&lt;img'));
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement escape + paragraph wrapper**

Replace parser body:

```js
function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function renderMarkdown(src){
  if (src == null) return '';
  var lines = String(src).replace(/\r\n?/g,'\n').split('\n');
  var out = [];
  for (var i=0;i<lines.length;i++){
    if (lines[i].length) out.push('<p>'+escapeHtml(lines[i])+'</p>');
  }
  return out.join('');
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: html-escape baseline (xss foundation)"
```

---

### Task 3: ATX Headings (# through ######)

- [ ] **Step 1: Tests**

```js
test('renders # H1 through ###### H6', () => {
  for (var n=1;n<=6;n++){
    var src = '#'.repeat(n) + ' Title';
    var out = ctx.renderMarkdown(src);
    assert.ok(out.includes('<h'+n+'>Title</h'+n+'>'));
  }
});

test('escapes content inside heading', () => {
  const out = ctx.renderMarkdown('# <script>x</script>');
  assert.ok(out.includes('<h1>&lt;script'));
});

test('seven hashes is not a heading', () => {
  const out = ctx.renderMarkdown('####### too many');
  assert.ok(!/<h[1-7]/.test(out));
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement** — block-level pre-pass that converts `^#{1,6} (.+)$` lines into `<hN>…</hN>` (escape content). Update line loop accordingly.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

---

### Task 4: Fenced code blocks (```)

- [ ] **Step 1: Tests**

```js
test('renders fenced code block with html-escaped content', () => {
  const out = ctx.renderMarkdown('```\n<b>x</b>\n```');
  assert.ok(/<pre><code>/.test(out));
  assert.ok(out.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('inline markup inside fenced code is not transformed', () => {
  const out = ctx.renderMarkdown('```\n**bold** *i*\n```');
  assert.ok(!out.includes('<strong>'));
  assert.ok(out.includes('**bold**'));
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement** — toggle a `inCode` flag when a line equals ``` ``` ``; collect raw lines verbatim, escape, emit `<pre><code>…</code></pre>`. Process BEFORE other line-level rules.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

---

### Task 5: Blockquotes (>)

- [ ] **Step 1: Tests**

```js
test('renders single blockquote line', () => {
  const out = ctx.renderMarkdown('> hello');
  assert.ok(/<blockquote>[\s\S]*hello[\s\S]*<\/blockquote>/.test(out));
});

test('escapes inside blockquote', () => {
  const out = ctx.renderMarkdown('> <script>x</script>');
  assert.ok(!/<script/i.test(out));
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement** — group consecutive `^>\s?(.*)$` lines, recurse on inner text for paragraphs, wrap output in `<blockquote>`.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

---

### Task 6: Unordered lists with one level of nesting

- [ ] **Step 1: Tests**

```js
test('renders top-level unordered list', () => {
  const out = ctx.renderMarkdown('- a\n- b\n* c\n+ d');
  assert.ok(/<ul>[\s\S]*<li>a<\/li>[\s\S]*<li>b<\/li>[\s\S]*<li>c<\/li>[\s\S]*<li>d<\/li>[\s\S]*<\/ul>/.test(out));
});

test('renders one level of nesting', () => {
  const out = ctx.renderMarkdown('- a\n  - a1\n  - a2\n- b');
  assert.ok(out.includes('<ul>'));
  assert.ok(/<li>a<ul><li>a1<\/li><li>a2<\/li><\/ul><\/li>/.test(out));
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement** — group adjacent `^([ ]{0,2})[-*+] (.+)$` lines into a 2-deep `<ul>` structure.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

---

### Task 7: Ordered lists

- [ ] **Step 1: Tests**

```js
test('renders ordered list', () => {
  const out = ctx.renderMarkdown('1. one\n2. two\n3. three');
  assert.ok(/<ol>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<li>three<\/li>[\s\S]*<\/ol>/.test(out));
});
```

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement** — group `^\d+\. (.+)$` lines into `<ol>`.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

---

### Task 8: Inline formatting — bold / italic / bold-italic / inline code / links

- [ ] **Step 1: Tests**

```js
test('bold-italic ***x***', () => {
  const out = ctx.renderMarkdown('***x***');
  assert.ok(/<strong><em>x<\/em><\/strong>|<em><strong>x<\/strong><\/em>/.test(out));
});

test('bold **x** and italic *y* and _z_', () => {
  const out = ctx.renderMarkdown('**x** *y* _z_');
  assert.ok(out.includes('<strong>x</strong>'));
  assert.ok(out.includes('<em>y</em>'));
  assert.ok(out.includes('<em>z</em>'));
});

test('inline code `x` does not transform inner markup', () => {
  const out = ctx.renderMarkdown('`**x**`');
  assert.ok(out.includes('<code>**x**</code>'));
});

test('inline link with safe URL', () => {
  const out = ctx.renderMarkdown('[hi](https://example.com)');
  assert.ok(out.includes('<a href="https://example.com">hi</a>'));
});

test('inline link with javascript: URL is sanitized', () => {
  const out = ctx.renderMarkdown('[x](javascript:alert(1))');
  assert.ok(!out.includes('javascript:'));
  assert.ok(out.includes('href="#"'));
});

test('inline link with data: URL is sanitized', () => {
  const out = ctx.renderMarkdown('[x](data:text/html,<script>)');
  assert.ok(!/data:/i.test(out));
});
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Implement two-pass inline transform**

After block escape, but before emission, on each text segment:

1. Extract inline code spans into placeholders (so their contents skip further transform).
2. Apply in order: `\*\*\*([^*]+)\*\*\*` → `<strong><em>$1</em></strong>`; `\*\*([^*]+)\*\*` → `<strong>`; `\*([^*]+)\*` → `<em>`; `_([^_]+)_` → `<em>`.
3. Links: `\[([^\]]+)\]\(([^)]+)\)` with URL allowlist (`^(https?:|mailto:|#|/)`) — fail → `href="#"`.
4. Restore code placeholders.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

---

### Task 9: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Sections: Opening the editor (file:// double-click), Running tests (`node --test markdown.test.js`), Supported syntax (list above), Not implemented (tables, images, HTML passthrough, footnotes, task lists, strikethrough, autolinks, reference links, heading IDs, multi-level nesting beyond one), Security approach (HTML-entity escape applied before all structural transforms; URL allowlist for links; no DOM-based parsing; fenced/inline code holds raw content as escaped text only).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README for markdown editor"
```

---

### Task 10: Final verification

- [ ] Run `node --test markdown.test.js` — expect all tests pass.
- [ ] Confirm `markdown.html` contains no `<script src=`, `<link href=`, or `<img src=` (offline-safe).
- [ ] Confirm debounce in inline JS is ≤ 250ms.
- [ ] Open file:// URL in browser, type `# Hello`, see `<h1>Hello</h1>` in preview within 250ms.
