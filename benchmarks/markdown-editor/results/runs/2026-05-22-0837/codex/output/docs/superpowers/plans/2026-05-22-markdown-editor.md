# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a disk-openable, single-file Markdown editor with a live, XSS-safe preview and Node built-in unit tests.

**Architecture:** `markdown.html` owns the UI, parser, renderer, sanitizer, and live-preview wiring in inline CSS and JavaScript. `markdown.test.js` extracts the embedded parser API from `markdown.html` and tests the same production parsing/rendering logic with Node's built-in `node:test`. `README.md` documents operation, supported syntax, omissions, and security behavior.

**Tech Stack:** Plain HTML, inline CSS, inline JavaScript, and Node.js built-in `node --test`; no npm, build step, external scripts, external styles, or network assets.

---

### Task 1: Establish Parser Tests First

**Files:**
- Create: `markdown.test.js`
- Later create: `markdown.html`

- [ ] **Step 1: Write the failing test file**

Create `markdown.test.js` with tests that read `markdown.html`, extract the parser script by `id="markdown-engine"`, execute it in a Node `vm` context, and assert initial behavior:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEngine() {
  const htmlPath = path.join(__dirname, 'markdown.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="markdown-engine">([\s\S]*?)<\/script>/);
  assert.ok(match, 'markdown.html must contain <script id="markdown-engine">');
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(match[1], context, { filename: 'markdown-engine.js' });
  return context.window.MarkdownEditor;
}

test('renders headings, inline emphasis, links, and code', () => {
  const { renderMarkdown } = loadEngine();
  const html = renderMarkdown('# Title\n\nThis is **bold**, *italic*, ***both***, `code`, and [a link](https://example.com).');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<strong><em>both<\/em><\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test markdown.test.js`

Expected: FAIL because `markdown.html` does not exist yet.

- [ ] **Step 3: Create the smallest extractable parser implementation**

Create `markdown.html` with a `<script id="markdown-engine">` that defines `window.MarkdownEditor.renderMarkdown(markdown)` and enough parsing to satisfy the initial tests.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test markdown.test.js`

Expected: PASS for the first parser behavior test.

### Task 2: Add Block Syntax Coverage

**Files:**
- Modify: `markdown.test.js`
- Modify: `markdown.html`

- [ ] **Step 1: Add failing tests for supported block syntax**

Add tests for ATX headings `#` through `######`, unordered lists with one nesting level, ordered lists, fenced code blocks, and blockquotes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test markdown.test.js`

Expected: FAIL on unsupported block constructs.

- [ ] **Step 3: Implement block parser support**

Update `renderMarkdown` to tokenize fenced code blocks first, then parse headings, blockquotes, unordered and ordered list runs, and paragraphs. Nest one level of unordered lists when a list line is indented by at least two spaces.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test markdown.test.js`

Expected: PASS for all parser block syntax tests.

### Task 3: Add Security Coverage

**Files:**
- Modify: `markdown.test.js`
- Modify: `markdown.html`

- [ ] **Step 1: Add failing XSS-safety tests**

Add tests proving raw `<script>` tags, raw HTML attributes such as `<img onerror=...>`, and `javascript:` markdown links are escaped or neutralized and do not appear as active HTML.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test markdown.test.js`

Expected: FAIL until raw HTML is escaped and unsafe links are rejected.

- [ ] **Step 3: Implement escaping and URL sanitization**

Escape all source text before inline markdown replacement. Generate only known-safe tags from the renderer. For links, allow only relative URLs, fragments, `http:`, `https:`, `mailto:`, and `tel:`; render unsafe URLs as escaped link text instead of anchors.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test markdown.test.js`

Expected: PASS for security tests.

### Task 4: Build the Editor Shell and Live Preview

**Files:**
- Modify: `markdown.html`
- Modify: `markdown.test.js`

- [ ] **Step 1: Add failing structural/live-preview tests**

Add tests that `markdown.html` contains no external `<script src>`, `<link rel="stylesheet">`, or remote asset references; contains a textarea and preview pane; and includes a debounce delay no greater than 250ms.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test markdown.test.js`

Expected: FAIL until the UI shell and live-preview scheduling are present.

- [ ] **Step 3: Implement the UI shell**

Add inline CSS for a responsive dual-pane editor, a left textarea, a right preview surface, and inline JavaScript that updates the preview on `input` using a short timeout constant not greater than `250`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test markdown.test.js`

Expected: PASS for parser, security, and HTML structure tests.

### Task 5: Documentation and Final Verification

**Files:**
- Create: `README.md`
- Verify: `markdown.html`
- Verify: `markdown.test.js`

- [ ] **Step 1: Write README**

Document how to open `markdown.html`, run `node --test markdown.test.js`, list supported syntax, list unsupported Markdown features, and describe hand-rolled escaping plus URL sanitization.

- [ ] **Step 2: Run the full unit test suite**

Run: `node --test markdown.test.js`

Expected: all tests pass with exit code `0`.

- [ ] **Step 3: Confirm disk-load behavior**

Run a Node command that reads `markdown.html`, executes its inline scripts in a lightweight DOM-like `vm` context, fires `DOMContentLoaded`, sends textarea `input`, waits at least the configured live-preview delay, and asserts the preview changes.

- [ ] **Step 4: Confirm no network dependencies**

Inspect the HTML and tests to confirm there are no external scripts, stylesheets, imports, fonts, images, or fetch/XHR calls.

- [ ] **Step 5: Update task checklist**

Mark this plan's implementation tasks complete only after the verification commands have been run and read.

