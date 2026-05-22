# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, file-runnable Markdown editor with live preview, XSS-safe rendering, command-line unit tests, and README documentation.

**Architecture:** Keep all browser production code inside `markdown.html` as inline CSS and inline JavaScript. Expose parser helpers through `window.MarkdownEditor` in the browser and `module.exports` when evaluated by Node tests, so tests exercise the same rendering logic embedded in the HTML. The renderer is a small hand-rolled Markdown subset parser that escapes all user text and emits only known-safe tags.

**Tech Stack:** Plain HTML, inline CSS, vanilla JavaScript, Node.js built-in `node:test`, `node:assert`, `node:fs`, and `node:vm`.

---

## File Structure

- Create: `markdown.html`
  - Single-file editor UI, inline CSS, inline JavaScript, parser functions, and 150ms debounced live preview.
- Create: `markdown.test.js`
  - Node built-in tests that extract the inline parser script from `markdown.html` and verify parsing, escaping, URL sanitization, and debounce timing constants.
- Create: `README.md`
  - Opening instructions, test command, supported subset, unsupported Markdown features, and security approach.

## Phase 1: Parser Safety and Inline Formatting

### Task 1: Parser API and escaping

**Files:**
- Create: `markdown.test.js`
- Create: `markdown.html`

- [ ] **Step 1: Write the failing test**

```js
test('escapes raw HTML instead of producing active elements', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test markdown.test.js`
Expected: FAIL because `markdown.html` or `renderMarkdown` is not defined yet.

- [ ] **Step 3: Write minimal implementation**

```js
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(markdown) {
  return String(markdown)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => `<p>${escapeInline(line)}</p>`)
    .join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test markdown.test.js`
Expected: PASS.

## Phase 2: Required Block Syntax

### Task 2: Headings, lists, blockquotes, and fenced code

**Files:**
- Modify: `markdown.test.js`
- Modify: `markdown.html`

- [ ] **Step 1: Write failing tests**

```js
test('renders ATX headings, blockquotes, and fenced code blocks', () => {
  const html = renderMarkdown('# Title\n> Quote\n```js\nconst x = 1 < 2;\n```');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<blockquote>\n<p>Quote<\/p>\n<\/blockquote>/);
  assert.match(html, /<pre><code>const x = 1 &lt; 2;\n<\/code><\/pre>/);
});

test('renders unordered nested lists and ordered lists', () => {
  const html = renderMarkdown('- One\n  - Child\n- Two\n\n1. First\n2. Second');
  assert.match(html, /<ul>\n<li>One\n<ul>\n<li>Child<\/li>\n<\/ul>\n<\/li>\n<li>Two<\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n<li>First<\/li>\n<li>Second<\/li>\n<\/ol>/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test markdown.test.js`
Expected: FAIL because block-level syntax is not implemented.

- [ ] **Step 3: Implement block parser**

Implement a line scanner with explicit branches for fenced code blocks, blockquote groups, unordered/ordered list groups, headings, blank lines, and paragraph groups. Escape code block text with `escapeHtml` and normal text with `escapeInline`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test markdown.test.js`
Expected: PASS.

## Phase 3: Required Inline Syntax and Safe Links

### Task 3: Inline formatting

**Files:**
- Modify: `markdown.test.js`
- Modify: `markdown.html`

- [ ] **Step 1: Write failing tests**

```js
test('renders inline emphasis, strong emphasis, combined emphasis, inline code, and links', () => {
  const html = renderMarkdown('***both*** **bold** *star* _under_ `code <x>` [Open](https://example.com?a=1&b=2)');
  assert.match(html, /<strong><em>both<\/em><\/strong>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>star<\/em>/);
  assert.match(html, /<em>under<\/em>/);
  assert.match(html, /<code>code &lt;x&gt;<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com\?a=1&amp;b=2" rel="noopener noreferrer">Open<\/a>/);
});

test('neutralizes javascript links', () => {
  const html = renderMarkdown('[bad](javascript:alert(1))');
  assert.match(html, /<a href="" rel="noopener noreferrer">bad<\/a>/);
  assert.doesNotMatch(html, /javascript:/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test markdown.test.js`
Expected: FAIL because required inline syntax and URL sanitization are incomplete.

- [ ] **Step 3: Implement inline tokenizer**

Protect inline code spans first, escape surrounding text, parse links with a safe URL whitelist, then apply combined/bold/italic emphasis. Reinsert code spans as escaped `<code>` elements.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test markdown.test.js`
Expected: PASS.

## Phase 4: Editor UI and Live Preview

### Task 4: Single-file UI

**Files:**
- Modify: `markdown.html`
- Modify: `markdown.test.js`

- [ ] **Step 1: Write failing tests**

```js
test('html file is self-contained and configures live preview within 250ms', () => {
  assert.match(htmlSource, /<textarea[^>]+id="markdown-input"/);
  assert.match(htmlSource, /<section[^>]+id="preview"/);
  assert.equal(DEBOUNCE_MS, 150);
  assert.ok(DEBOUNCE_MS <= 250);
  assert.doesNotMatch(htmlSource, /\s(?:src|href)=["']https?:\/\//i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test markdown.test.js`
Expected: FAIL because the editor layout and live preview constant are missing or incomplete.

- [ ] **Step 3: Implement UI**

Add a responsive dual-pane layout with a labeled Markdown textarea on the left and preview region on the right. Wire `input` events to a debounced `renderNow` function using `setTimeout` with `DEBOUNCE_MS = 150`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test markdown.test.js`
Expected: PASS.

## Phase 5: README and Verification

### Task 5: Documentation and final checks

**Files:**
- Create: `README.md`
- Verify: `markdown.html`
- Verify: `markdown.test.js`

- [ ] **Step 1: Write README**

Document `markdown.html`, `node --test markdown.test.js`, supported Markdown, unsupported Markdown, and the hand-rolled escaping/sanitization approach.

- [ ] **Step 2: Run full tests**

Run: `node --test markdown.test.js`
Expected: PASS, 0 failed.

- [ ] **Step 3: Confirm file URL smoke check**

Run: `node -e "const fs=require('fs'); const p=require('path').resolve('markdown.html'); const s=fs.readFileSync(p,'utf8'); console.log('file://' + p.replace(/\\\\/g,'/')); if(!s.includes('id=\"markdown-input\"') || !s.includes('id=\"preview\"')) process.exit(1)"`
Expected: prints a `file://` URL and exits 0.

- [ ] **Step 4: Confirm live preview delay**

Run: `node --test markdown.test.js`
Expected: `DEBOUNCE_MS <= 250` test passes.

## Self-Review

- Spec coverage: The tasks cover the single HTML deliverable, live dual-pane editor, all listed Markdown syntax, XSS-safe escaping and URL filtering, no external dependencies, file URL execution, command-line tests, and README.
- Placeholder scan: No task depends on undefined placeholders.
- Type consistency: The plan consistently uses `renderMarkdown`, `escapeHtml`, `escapeInline`, `sanitizeUrl`, and `DEBOUNCE_MS`.
