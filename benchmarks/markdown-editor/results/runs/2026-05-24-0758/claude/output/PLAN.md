# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained single-file HTML markdown editor with live preview, XSS-safe rendering, and Node-runnable unit tests.

**Architecture:** Single `markdown.html` file with inline CSS+JS. Markdown parser is a pure function `renderMarkdown(src) -> safeHtml` defined inside a `<script>` block, delimited by `/* PARSER_START */` and `/* PARSER_END */` markers. Tests read the HTML file, extract the parser block, evaluate it in a Node `vm` context, and assert on parser output. This keeps the HTML truly self-contained while avoiding code duplication between browser and tests.

**Tech Stack:** Plain HTML/CSS/JavaScript (ES2020), Node's built-in `node:test` and `node:assert` for testing, `node:vm` for parser extraction.

---

## File Structure

- `markdown.html` — the editor (textarea + preview, debounced live update, inline parser)
- `markdown.test.js` — Node test suite covering parser correctness + XSS safety
- `README.md` — usage, test command, supported subset, security approach

---

## Phase 1: Scaffold

### Task 1: Create test harness that extracts parser from HTML

**Files:**
- Create: `markdown.test.js`
- Create: `markdown.html`

- [ ] **Step 1: Write skeleton HTML with parser markers**

`markdown.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Markdown Editor</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,sans-serif}
  .app{display:flex;height:100vh}
  .pane{flex:1;overflow:auto;padding:1rem;box-sizing:border-box}
  #src{width:100%;height:100%;border:0;outline:0;resize:none;font:14px/1.5 ui-monospace,monospace;border-right:1px solid #ddd}
  #preview{border-left:1px solid #ddd}
  #preview pre{background:#f4f4f4;padding:.5rem;overflow:auto}
  #preview code{background:#f4f4f4;padding:0 .25rem;border-radius:3px}
  #preview blockquote{border-left:4px solid #ccc;margin:0;padding:0 .75rem;color:#555}
</style>
</head>
<body>
<div class="app">
  <div class="pane"><textarea id="src" spellcheck="false"></textarea></div>
  <div class="pane" id="preview"></div>
</div>
<script>
/* PARSER_START */
function renderMarkdown(src){
  return '';
}
/* PARSER_END */
const srcEl = document.getElementById('src');
const previewEl = document.getElementById('preview');
let t;
srcEl.addEventListener('input', () => {
  clearTimeout(t);
  t = setTimeout(() => { previewEl.innerHTML = renderMarkdown(srcEl.value); }, 200);
});
</script>
</body>
</html>
```

- [ ] **Step 2: Write test harness that extracts parser**

`markdown.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'markdown.html'), 'utf8');
const m = html.match(/\/\* PARSER_START \*\/([\s\S]*?)\/\* PARSER_END \*\//);
if (!m) throw new Error('PARSER markers not found in markdown.html');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\n;this.renderMarkdown = renderMarkdown;', ctx);
const render = ctx.renderMarkdown;

test('harness: parser is callable', () => {
  assert.equal(typeof render, 'function');
  assert.equal(render(''), '');
});
```

- [ ] **Step 3: Run test to verify harness works**

Run: `node --test markdown.test.js`
Expected: 1 test passing.

- [ ] **Step 4: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "scaffold: html shell + node:test harness with parser extraction"
```

---

## Phase 2: Parser (TDD per feature)

The parser is line-based. We'll iterate features one at a time. After each task the parser stays a single function in the HTML; we keep it readable by structuring it as block-level scan + inline transform.

### Task 2: HTML-escape baseline (security foundation)

**Files:**
- Modify: `markdown.html` (parser block)
- Modify: `markdown.test.js`

- [ ] **Step 1: Write failing tests**

Append to `markdown.test.js`:
```javascript
test('escapes raw HTML', () => {
  const out = render('<script>alert(1)</script>');
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});
test('escapes img onerror payload', () => {
  const out = render('<img src=x onerror=alert(1)>');
  assert.ok(!/<img\b/i.test(out));
  assert.ok(out.includes('&lt;img'));
});
test('escapes ampersands and quotes', () => {
  const out = render('a & b "c" \'d\'');
  assert.ok(out.includes('&amp;'));
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test markdown.test.js`
Expected: 3 failures (parser returns '').

- [ ] **Step 3: Implement escape + paragraph fallback**

Replace parser body with:
```javascript
function renderMarkdown(src){
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  // Minimal: wrap whole input as paragraph of escaped text.
  if (!src) return '';
  return '<p>' + esc(src) + '</p>';
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test markdown.test.js`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.test.js
git commit -m "parser: html-escape baseline"
```

### Task 3: ATX headings

- [ ] **Step 1: Write failing tests**

```javascript
test('h1', () => { assert.equal(render('# Hello'), '<h1>Hello</h1>'); });
test('h6', () => { assert.equal(render('###### x'), '<h6>x</h6>'); });
test('not heading without space', () => { assert.ok(render('#NoSpace').startsWith('<p>')); });
test('heading escapes content', () => {
  assert.equal(render('# <b>x</b>'), '<h1>&lt;b&gt;x&lt;/b&gt;</h1>');
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement block-by-line scanner**

Replace parser with:
```javascript
function renderMarkdown(src){
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  if (!src) return '';
  const lines = src.replace(/\r\n?/g,'\n').split('\n');
  const out = [];
  let para = [];
  const flushPara = () => {
    if (para.length){
      out.push('<p>' + esc(para.join('\n')) + '</p>');
      para = [];
    }
  };
  for (const line of lines){
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h){ flushPara(); out.push('<h'+h[1].length+'>'+esc(h[2])+'</h'+h[1].length+'>'); continue; }
    if (line === ''){ flushPara(); continue; }
    para.push(line);
  }
  flushPara();
  return out.join('');
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit** `git commit -am "parser: ATX headings"`

### Task 4: Fenced code blocks (must precede inline so triple-backtick doesn't get eaten)

- [ ] **Step 1: Write failing tests**

```javascript
test('fenced code block', () => {
  assert.equal(render('```\nfoo\nbar\n```'), '<pre><code>foo\nbar\n</code></pre>');
});
test('fenced code escapes html', () => {
  const o = render('```\n<script>\n```');
  assert.ok(o.includes('&lt;script&gt;'));
  assert.ok(!o.includes('<script>'));
});
test('fenced ignores markdown inside', () => {
  assert.equal(render('```\n# not heading\n```'), '<pre><code># not heading\n</code></pre>');
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Add fence detection to scanner**

In the for-loop, before the heading check:
```javascript
    if (/^```/.test(line)){
      flushPara();
      const buf = [];
      // collect until closing fence (consume in outer loop via index)
      // refactor loop to index-based
      // (see Step 3b)
    }
```

Refactor the loop to be index-based to handle multi-line constructs. Final parser shape:
```javascript
function renderMarkdown(src){
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  if (!src) return '';
  const lines = src.replace(/\r\n?/g,'\n').split('\n');
  const out = [];
  let para = [];
  const flushPara = () => {
    if (para.length){ out.push('<p>' + esc(para.join('\n')) + '</p>'); para = []; }
  };
  for (let i = 0; i < lines.length; i++){
    const line = lines[i];
    if (/^```/.test(line)){
      flushPara();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      out.push('<pre><code>' + esc(buf.join('\n') + (buf.length?'\n':'')) + '</code></pre>');
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h){ flushPara(); out.push('<h'+h[1].length+'>'+esc(h[2])+'</h'+h[1].length+'>'); continue; }
    if (line === ''){ flushPara(); continue; }
    para.push(line);
  }
  flushPara();
  return out.join('');
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit** `git commit -am "parser: fenced code blocks"`

### Task 5: Blockquotes

- [ ] **Step 1: Write failing tests**

```javascript
test('blockquote', () => {
  assert.equal(render('> hi'), '<blockquote>hi</blockquote>');
});
test('multi-line blockquote', () => {
  assert.equal(render('> a\n> b'), '<blockquote>a\nb</blockquote>');
});
test('blockquote escapes html', () => {
  assert.ok(render('> <b>x').includes('&lt;b&gt;x'));
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Add blockquote branch**

Insert after fence handling, before heading:
```javascript
    if (/^>\s?/.test(line)){
      flushPara();
      const buf = [line.replace(/^>\s?/,'')];
      while (i+1 < lines.length && /^>\s?/.test(lines[i+1])){ i++; buf.push(lines[i].replace(/^>\s?/,'')); }
      out.push('<blockquote>' + esc(buf.join('\n')) + '</blockquote>');
      continue;
    }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit** `git commit -am "parser: blockquotes"`

### Task 6: Unordered lists with one level of nesting

- [ ] **Step 1: Write failing tests**

```javascript
test('unordered list', () => {
  assert.equal(render('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
});
test('unordered list with * and +', () => {
  assert.equal(render('* a\n+ b'), '<ul><li>a</li><li>b</li></ul>');
});
test('nested unordered list', () => {
  assert.equal(
    render('- a\n  - b\n  - c\n- d'),
    '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>'
  );
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement list collector**

Add helper above the main loop and branch in loop:
```javascript
  const isUL = s => /^([-*+])\s+(.*)$/.exec(s);
  const isULNested = s => /^  ([-*+])\s+(.*)$/.exec(s);
```
In the loop, after blockquote branch:
```javascript
    if (isUL(line)){
      flushPara();
      let html = '<ul>';
      while (i < lines.length){
        const top = isUL(lines[i]);
        if (!top) break;
        html += '<li>' + esc(top[2]);
        // collect nested
        if (i+1 < lines.length && isULNested(lines[i+1])){
          html += '<ul>';
          while (i+1 < lines.length && isULNested(lines[i+1])){
            i++;
            const n = isULNested(lines[i]);
            html += '<li>' + esc(n[2]) + '</li>';
          }
          html += '</ul>';
        }
        html += '</li>';
        i++;
      }
      i--; // step back so outer for-loop increment lands correctly
      out.push(html + '</ul>');
      continue;
    }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit** `git commit -am "parser: unordered lists with one level of nesting"`

### Task 7: Ordered lists

- [ ] **Step 1: Write failing tests**

```javascript
test('ordered list', () => {
  assert.equal(render('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
});
test('ordered list accepts any digits', () => {
  assert.equal(render('1. a\n5. b'), '<ol><li>a</li><li>b</li></ol>');
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Add OL branch**

After UL branch:
```javascript
    const isOL = s => /^\d+\.\s+(.*)$/.exec(s);
    if (isOL(line)){
      flushPara();
      let html = '<ol>';
      while (i < lines.length){
        const m2 = isOL(lines[i]);
        if (!m2) break;
        html += '<li>' + esc(m2[1]) + '</li>';
        i++;
      }
      i--;
      out.push(html + '</ol>');
      continue;
    }
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit** `git commit -am "parser: ordered lists"`

### Task 8: Inline transforms (post-escape pass) — bold, italic, bold+italic, inline code, links

The inline pass runs on already-escaped text and on content destined for `<p>`, `<h*>`, `<li>`, `<blockquote>`. We add an `inline(s)` helper. Critical ordering: protect inline code spans first (their content must not be touched), then ***bold-italic***, then **bold**, then *italic* / _italic_, then links.

- [ ] **Step 1: Write failing tests**

```javascript
test('bold', () => { assert.equal(render('**x**'), '<p><strong>x</strong></p>'); });
test('italic star', () => { assert.equal(render('*x*'), '<p><em>x</em></p>'); });
test('italic underscore', () => { assert.equal(render('_x_'), '<p><em>x</em></p>'); });
test('bold italic', () => {
  assert.equal(render('***x***'), '<p><strong><em>x</em></strong></p>');
});
test('inline code', () => {
  assert.equal(render('see `x` here'), '<p>see <code>x</code> here</p>');
});
test('inline code preserves literal asterisks', () => {
  assert.equal(render('`**a**`'), '<p><code>**a**</code></p>');
});
test('inline code escapes html', () => {
  assert.equal(render('`<b>`'), '<p><code>&lt;b&gt;</code></p>');
});
test('link', () => {
  assert.equal(render('[hi](https://example.com)'), '<p><a href="https://example.com">hi</a></p>');
});
test('inline transforms inside heading', () => {
  assert.equal(render('# **bold**'), '<h1><strong>bold</strong></h1>');
});
test('inline transforms inside list item', () => {
  assert.equal(render('- *em*'), '<ul><li><em>em</em></li></ul>');
});
```

- [ ] **Step 2: Run, verify failure**

- [ ] **Step 3: Implement inline helper and apply to relevant blocks**

Add inside `renderMarkdown`, after `esc`:
```javascript
  const sanitizeUrl = u => {
    const t = u.trim().toLowerCase();
    if (t.startsWith('javascript:') || t.startsWith('data:') || t.startsWith('vbscript:')) return '#';
    return u.replace(/"/g,'%22');
  };
  const inline = s => {
    // s is already html-escaped. Protect inline code first.
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return ' CODE'+(codes.length-1)+' '; });
    // ***bold italic***
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    // **bold**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic*
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    // _italic_
    s = s.replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, '$1<em>$2</em>');
    // links [text](url) — text and url are already escaped
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => '<a href="'+sanitizeUrl(url)+'">'+text+'</a>');
    // restore inline code (content stays escaped, no inline transforms inside)
    s = s.replace(/ CODE(\d+) /g, (_, n) => '<code>'+codes[+n]+'</code>');
    return s;
  };
```

Apply `inline(...)` to: paragraph text, heading content, blockquote content, list item content. Update each `esc(...)` site that wraps a `<p>`/`<h*>`/`<li>`/`<blockquote>` content to `inline(esc(...))`.

Concretely update these emit lines:
- `out.push('<p>' + inline(esc(para.join('\n'))) + '</p>');`
- `out.push('<h'+h[1].length+'>' + inline(esc(h[2])) + '</h'+h[1].length+'>');`
- `out.push('<blockquote>' + inline(esc(buf.join('\n'))) + '</blockquote>');`
- UL: `html += '<li>' + inline(esc(top[2]));` and nested `html += '<li>' + inline(esc(n[2])) + '</li>';`
- OL: `html += '<li>' + inline(esc(m2[1])) + '</li>';`

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit** `git commit -am "parser: inline bold/italic/code/links"`

### Task 9: XSS hardening — javascript: URLs and friends

- [ ] **Step 1: Write failing tests**

```javascript
test('javascript: URL is neutralized', () => {
  const o = render('[x](javascript:alert(1))');
  assert.ok(!/href="javascript:/i.test(o));
  assert.ok(o.includes('href="#"'));
});
test('JAVASCRIPT: with case + whitespace is neutralized', () => {
  const o = render('[x](  JaVaScRiPt:alert(1))');
  assert.ok(!/href="[^"]*javascript:/i.test(o));
});
test('data: URL is neutralized', () => {
  const o = render('[x](data:text/html,<script>1)');
  assert.ok(!/href="data:/i.test(o));
});
test('raw script tag in source does not produce active script in output', () => {
  const o = render('<script>alert(1)</script>');
  assert.ok(!/<script\b/i.test(o));
});
test('img onerror does not produce active img', () => {
  const o = render('<img src=x onerror=alert(1)>');
  assert.ok(!/<img\b/i.test(o));
});
test('script tag inside fenced code is inert', () => {
  const o = render('```\n<script>alert(1)</script>\n```');
  assert.ok(!/<script\b/i.test(o));
  assert.ok(o.includes('&lt;script&gt;'));
});
```

- [ ] **Step 2: Run tests, verify pass (sanitizeUrl from Task 8 already covers most)**

If any fail, harden `sanitizeUrl` further (trim whitespace, strip control chars before the colon-protocol check).

- [ ] **Step 3: Commit** `git commit -am "test: explicit XSS coverage"`

---

## Phase 3: UX polish

### Task 10: Seed the textarea with a sample doc and verify visually

- [ ] **Step 1: Add a default value to the textarea**

In `markdown.html`, set initial textarea content via JS (so the file stays small and readable). Just after `const previewEl = ...` add:
```javascript
srcEl.value = `# Markdown Editor

Type on the **left**, see _rendered_ HTML on the right.

- bullet one
- bullet two
  - nested
- bullet three

1. first
2. second

> a quote

\`inline code\` and a [link](https://example.com).

\`\`\`
fenced code
<script>alert(1)</script>
\`\`\`
`;
previewEl.innerHTML = renderMarkdown(srcEl.value);
```

- [ ] **Step 2: Open `markdown.html` in browser via file://, confirm visual rendering**

This is a manual check — see verification phase.

- [ ] **Step 3: Commit** `git commit -am "ui: seed editor with sample document"`

### Task 11: Debounce timing test

- [ ] **Step 1: Add a timing assertion to the test file (or document the manual check)**

Add to `markdown.test.js`:
```javascript
test('debounce delay is <= 250ms', () => {
  const m2 = html.match(/setTimeout\(\s*\(\)\s*=>[^,]+,\s*(\d+)\s*\)/);
  assert.ok(m2, 'debounce setTimeout not found');
  const delay = parseInt(m2[1], 10);
  assert.ok(delay <= 250, `debounce delay was ${delay}, must be <= 250`);
});
```

- [ ] **Step 2: Run tests** — Expected: pass (we used 200).

- [ ] **Step 3: Commit** `git commit -am "test: enforce <=250ms debounce"`

---

## Phase 4: Documentation

### Task 12: Write README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
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
```

- [ ] **Step 2: Commit** `git commit -am "docs: README"`

---

## Phase 5: Verification

### Task 13: Run full test suite and confirm

- [ ] **Step 1: Run** `node --test markdown.test.js`
- [ ] **Step 2: Confirm** all tests pass, no skips.
- [ ] **Step 3: Open `markdown.html` from disk** (file://) and confirm:
  - Page loads with no network errors (DevTools Network tab empty)
  - Sample doc renders in the right pane on load
  - Typing in the left pane updates the right pane within ~250ms
  - Pasting `<script>alert(1)</script>` shows literal text, no alert
  - Pasting `[x](javascript:alert(1))` renders a link whose href is `#`, no alert on click

---

## Self-Review checklist

- [x] ATX headings 1-6 — Task 3
- [x] Bold / italic / bold+italic — Task 8
- [x] Unordered lists with one level of nesting — Task 6
- [x] Ordered lists — Task 7
- [x] Inline code — Task 8
- [x] Fenced code blocks — Task 4
- [x] Inline links — Task 8
- [x] Blockquotes — Task 5
- [x] XSS-safe (script, img onerror, javascript:) — Tasks 2, 8, 9
- [x] Inline CSS/JS, no external deps — Task 1
- [x] file:// works — verified Task 13
- [x] Live preview <=250ms — Tasks 1, 11
- [x] Tests run with `node --test`, no install — Task 1, 13
- [x] README — Task 12
