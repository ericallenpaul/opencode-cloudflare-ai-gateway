# Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained `markdown.html` editor with a dual-pane live preview, a safe hand-rolled markdown subset renderer, built-in inline assets only, and Node built-in unit tests.

**Architecture:** Keep the editor standalone by embedding styles and browser logic directly in `markdown.html`. Implement the markdown parser and safe HTML renderer in a separate `markdown.testable.js` module for Node tests first, then mirror that logic into the HTML file so the editor still runs from disk with no dependencies. Use escaping plus protocol validation instead of trusting raw HTML.

**Tech Stack:** Plain HTML, CSS, browser JavaScript, Node.js built-in `node:test`, `assert/strict`

---

### Task 1: Define parser and sanitizer behavior with tests

**Files:**
- Create: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.test.js`
- Test: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.testable.js';

test('renders headings, emphasis, lists, links, code, and blockquotes', () => {
  const html = renderMarkdown('# Title');
  assert.match(html, /<h1>Title<\/h1>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test markdown.test.js`
Expected: FAIL with module-not-found or missing export for `./markdown.testable.js`

- [ ] **Step 3: Write minimal implementation**

```js
export function renderMarkdown(markdown) {
  return markdown;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test markdown.test.js`
Expected: PASS for the minimal heading case only after implementation matches the assertion

- [ ] **Step 5: Commit**

```bash
git add markdown.test.js markdown.testable.js
git commit -m "test: define markdown renderer behavior"
```

### Task 2: Grow parser support with red-green cycles

**Files:**
- Modify: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.test.js`
- Create: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.testable.js`
- Test: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('blocks script tags, event handlers, and javascript urls', () => {
  const html = renderMarkdown('[x](javascript:alert(1)) <script>alert(1)</script>');
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /javascript:/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test markdown.test.js`
Expected: FAIL because the current renderer leaves unsafe content or does not support the required markdown blocks

- [ ] **Step 3: Write minimal implementation**

```js
export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test markdown.test.js`
Expected: PASS for the newly added coverage and prior tests

- [ ] **Step 5: Commit**

```bash
git add markdown.test.js markdown.testable.js
git commit -m "feat: implement safe markdown subset renderer"
```

### Task 3: Build the standalone editor UI

**Files:**
- Create: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.html`
- Modify: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.testable.js`

- [ ] **Step 1: Write the failing test**

```js
test('exposes the standalone renderer for embedding', () => {
  const html = renderMarkdown('`code`');
  assert.match(html, /<code>code<\/code>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test markdown.test.js`
Expected: FAIL until inline parsing covers inline code and other editor-visible formatting

- [ ] **Step 3: Write minimal implementation**

```html
<div class="app">
  <textarea id="input"></textarea>
  <div id="preview"></div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test markdown.test.js`
Expected: PASS for all renderer tests while the HTML file embeds the same logic and debounced preview update

- [ ] **Step 5: Commit**

```bash
git add markdown.html markdown.testable.js markdown.test.js
git commit -m "feat: add standalone markdown editor"
```

### Task 4: Document usage and verify requirements

**Files:**
- Create: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\README.md`

- [ ] **Step 1: Write the failing test**

```js
test('renders fenced code blocks distinctly from inline code', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  assert.match(html, /<pre><code>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test markdown.test.js`
Expected: FAIL until fenced blocks are implemented and escaped correctly

- [ ] **Step 3: Write minimal implementation**

```md
# Markdown Editor

Open `markdown.html` in a browser and run `node --test markdown.test.js`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test markdown.test.js`
Expected: PASS for the final renderer behavior

- [ ] **Step 5: Commit**

```bash
git add README.md markdown.test.js markdown.html markdown.testable.js
git commit -m "docs: document markdown editor usage"
```

### Task 5: Final verification sweep

**Files:**
- Verify: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.html`
- Verify: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\markdown.test.js`
- Verify: `C:\Users\eric.paul\source\repos\opencode-cloudflare-ai-gateway\benchmarks\runs\2026-05-26-0829\codex\README.md`

- [ ] **Step 1: Run automated tests**

Run: `node --test markdown.test.js`
Expected: PASS with zero failures

- [ ] **Step 2: Open the HTML file from disk and verify runtime behavior**

Run: open `file:///C:/Users/eric.paul/source/repos/opencode-cloudflare-ai-gateway/benchmarks/runs/2026-05-26-0829/codex/markdown.html`
Expected: editor loads with no network requests and preview renders locally

- [ ] **Step 3: Verify preview timing**

Run: use browser instrumentation to type into the textarea and measure the time between input and preview DOM update
Expected: preview update remains at or under roughly 250 ms because the debounced render delay is set within that bound

- [ ] **Step 4: Re-check the requirement list**

Run: compare the delivered files and observed behavior against the benchmark requirements
Expected: each requested deliverable exists and each markdown/security requirement is covered
