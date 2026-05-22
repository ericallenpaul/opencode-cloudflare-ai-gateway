const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, 'markdown.html');
const htmlSource = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';

function loadEditorApi() {
  assert.notEqual(htmlSource, '', 'markdown.html should exist');
  const match = htmlSource.match(/<script id="markdown-engine">([\s\S]*?)<\/script>/);
  assert.ok(match, 'markdown.html should include the markdown-engine script');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    window: {},
    document: {
      addEventListener() {},
    },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'markdown-engine.js' });
  return sandbox.module.exports;
}

test('escapes raw HTML instead of producing active elements', () => {
  const { renderMarkdown } = loadEditorApi();
  const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(1)>');

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
});

test('renders ATX headings, blockquotes, and fenced code blocks', () => {
  const { renderMarkdown } = loadEditorApi();
  const html = renderMarkdown('# Title\n> Quote\n```js\nconst x = 1 < 2;\n```');

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<blockquote>\n<p>Quote<\/p>\n<\/blockquote>/);
  assert.match(html, /<pre><code>const x = 1 &lt; 2;\n<\/code><\/pre>/);
});

test('renders unordered nested lists and ordered lists', () => {
  const { renderMarkdown } = loadEditorApi();
  const html = renderMarkdown('- One\n  - Child\n- Two\n\n1. First\n2. Second');

  assert.match(html, /<ul>\n<li>One\n<ul>\n<li>Child<\/li>\n<\/ul>\n<\/li>\n<li>Two<\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n<li>First<\/li>\n<li>Second<\/li>\n<\/ol>/);
});

test('renders inline emphasis, code spans, and links', () => {
  const { renderMarkdown } = loadEditorApi();
  const html = renderMarkdown('***both*** **bold** *star* _under_ `code <x>` [Open](https://example.com?a=1&b=2)');

  assert.match(html, /<strong><em>both<\/em><\/strong>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>star<\/em>/);
  assert.match(html, /<em>under<\/em>/);
  assert.match(html, /<code>code &lt;x&gt;<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com\?a=1&amp;b=2" rel="noopener noreferrer">Open<\/a>/);
});

test('neutralizes javascript links', () => {
  const { renderMarkdown } = loadEditorApi();
  const html = renderMarkdown('[bad](javascript:alert(1))');

  assert.match(html, /<a href="" rel="noopener noreferrer">bad<\/a>/);
  assert.doesNotMatch(html, /javascript:/i);
});

test('html file is self-contained and configures a dual-pane editor', () => {
  const { DEBOUNCE_MS } = loadEditorApi();

  assert.match(htmlSource, /<textarea[^>]+id="markdown-input"/);
  assert.match(htmlSource, /<section[^>]+id="preview"/);
  assert.ok(DEBOUNCE_MS <= 250);
  assert.doesNotMatch(htmlSource, /\s(?:src|href)=["']https?:\/\//i);
});

test('live preview schedules input renders within 250ms', () => {
  const { attachLivePreview, DEBOUNCE_MS } = loadEditorApi();
  let inputHandler;
  let scheduledDelay;
  let scheduledCallback;
  const input = {
    value: '# Live',
    addEventListener(type, handler) {
      assert.equal(type, 'input');
      inputHandler = handler;
    },
  };
  const preview = {
    innerHTML: '',
  };

  attachLivePreview(input, preview, {
    setTimeout(callback, delay) {
      scheduledCallback = callback;
      scheduledDelay = delay;
      return 1;
    },
    clearTimeout() {},
  });

  assert.equal(preview.innerHTML, '<h1>Live</h1>');
  input.value = '**Fast**';
  inputHandler();
  assert.equal(scheduledDelay, DEBOUNCE_MS);
  assert.ok(scheduledDelay <= 250);
  scheduledCallback();
  assert.equal(preview.innerHTML, '<p><strong>Fast</strong></p>');
});
