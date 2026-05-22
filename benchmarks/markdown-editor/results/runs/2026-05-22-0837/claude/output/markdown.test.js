'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the parser by extracting the <script id="parser"> block from markdown.html
// and evaluating it in a vm sandbox. This guarantees the tests exercise the same
// parser the browser runs.
function loadParser() {
  const html = fs.readFileSync(path.join(__dirname, 'markdown.html'), 'utf8');
  const match = html.match(/<script id="parser"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('Could not find <script id="parser"> block in markdown.html');
  }
  const sandbox = { module: { exports: {} }, exports: {} };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'markdown.html#parser' });
  return sandbox.module.exports;
}

const parser = loadParser();
const renderMarkdown = parser.renderMarkdown;
const escapeHtml = parser.escapeHtml;

test('renderMarkdown is exported', () => {
  assert.strictEqual(typeof renderMarkdown, 'function');
});

test('escapeHtml escapes ampersand first', () => {
  assert.strictEqual(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('escapeHtml passes plain text through', () => {
  assert.strictEqual(escapeHtml('hello world'), 'hello world');
});

test('plain paragraph wraps in <p>', () => {
  assert.strictEqual(renderMarkdown('hello'), '<p>hello</p>');
});

test('blank line splits paragraphs', () => {
  assert.strictEqual(renderMarkdown('one\n\ntwo'), '<p>one</p>\n<p>two</p>');
});

test('paragraph escapes html', () => {
  assert.strictEqual(renderMarkdown('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
});

test('h1 through h6', () => {
  assert.strictEqual(renderMarkdown('# H1'), '<h1>H1</h1>');
  assert.strictEqual(renderMarkdown('## H2'), '<h2>H2</h2>');
  assert.strictEqual(renderMarkdown('### H3'), '<h3>H3</h3>');
  assert.strictEqual(renderMarkdown('#### H4'), '<h4>H4</h4>');
  assert.strictEqual(renderMarkdown('##### H5'), '<h5>H5</h5>');
  assert.strictEqual(renderMarkdown('###### H6'), '<h6>H6</h6>');
});

test('seven hashes is not a heading', () => {
  assert.strictEqual(renderMarkdown('####### nope'), '<p>####### nope</p>');
});

test('heading without space is not a heading', () => {
  assert.strictEqual(renderMarkdown('#nospace'), '<p>#nospace</p>');
});

test('heading content is escaped', () => {
  assert.strictEqual(renderMarkdown('# <script>'), '<h1>&lt;script&gt;</h1>');
});

test('blockquote single line', () => {
  assert.strictEqual(renderMarkdown('> quoted'), '<blockquote>\n<p>quoted</p>\n</blockquote>');
});

test('blockquote multiple lines collapse to one block', () => {
  assert.strictEqual(
    renderMarkdown('> line one\n> line two'),
    '<blockquote>\n<p>line one\nline two</p>\n</blockquote>'
  );
});

test('fenced code block escapes content', () => {
  assert.strictEqual(
    renderMarkdown('```\n<script>alert(1)</script>\n```'),
    '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;\n</code></pre>'
  );
});

test('fenced code block ignores inline markdown', () => {
  assert.strictEqual(
    renderMarkdown('```\n**not bold**\n```'),
    '<pre><code>**not bold**\n</code></pre>'
  );
});

test('inline code', () => {
  assert.strictEqual(renderMarkdown('use `foo()` here'), '<p>use <code>foo()</code> here</p>');
});

test('inline code escapes content', () => {
  assert.strictEqual(
    renderMarkdown('try `<script>`'),
    '<p>try <code>&lt;script&gt;</code></p>'
  );
});

test('inline code does not interpret bold inside', () => {
  assert.strictEqual(renderMarkdown('`**x**`'), '<p><code>**x**</code></p>');
});

test('bold with double asterisks', () => {
  assert.strictEqual(renderMarkdown('**bold**'), '<p><strong>bold</strong></p>');
});

test('italic with single asterisks', () => {
  assert.strictEqual(renderMarkdown('*italic*'), '<p><em>italic</em></p>');
});

test('italic with underscores', () => {
  assert.strictEqual(renderMarkdown('_italic_'), '<p><em>italic</em></p>');
});

test('bold italic with triple asterisks', () => {
  assert.strictEqual(renderMarkdown('***both***'), '<p><strong><em>both</em></strong></p>');
});

test('inline link basic', () => {
  assert.strictEqual(
    renderMarkdown('[click](https://example.com)'),
    '<p><a href="https://example.com">click</a></p>'
  );
});

test('inline link with http', () => {
  assert.strictEqual(
    renderMarkdown('[click](http://example.com)'),
    '<p><a href="http://example.com">click</a></p>'
  );
});

test('inline link mailto', () => {
  assert.strictEqual(
    renderMarkdown('[mail](mailto:a@b.com)'),
    '<p><a href="mailto:a@b.com">mail</a></p>'
  );
});

test('inline link relative path', () => {
  assert.strictEqual(
    renderMarkdown('[doc](/docs/page)'),
    '<p><a href="/docs/page">doc</a></p>'
  );
});

test('javascript: link is rejected and rendered as literal', () => {
  const out = renderMarkdown('[x](javascript:alert(1))');
  assert.ok(!/<a /i.test(out), `Expected no anchor tag, got: ${out}`);
  assert.ok(!/javascript:/i.test(out), `Expected no javascript: scheme in output, got: ${out}`);
});

test('JAVASCRIPT: link (uppercase) is rejected', () => {
  const out = renderMarkdown('[x](JAVASCRIPT:alert(1))');
  assert.ok(!/<a /i.test(out));
  assert.ok(!/javascript:/i.test(out));
});

test('javascript: with leading whitespace is rejected', () => {
  const out = renderMarkdown('[x](  javascript:alert(1))');
  assert.ok(!/<a /i.test(out));
});

test('data: link is rejected', () => {
  const out = renderMarkdown('[x](data:text/html,<script>alert(1)</script>)');
  assert.ok(!/<a /i.test(out));
});

test('vbscript: link is rejected', () => {
  const out = renderMarkdown('[x](vbscript:msgbox(1))');
  assert.ok(!/<a /i.test(out));
});

test('link href is attribute-escaped', () => {
  const out = renderMarkdown('[x](https://example.com/?a="b")');
  assert.ok(out.includes('&quot;'), `Expected quote escape, got: ${out}`);
});

test('link text is escaped', () => {
  const out = renderMarkdown('[<script>](https://example.com)');
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(!out.includes('<script>'));
});

test('unordered list with dash', () => {
  assert.strictEqual(
    renderMarkdown('- one\n- two'),
    '<ul>\n<li>one</li>\n<li>two</li>\n</ul>'
  );
});

test('unordered list with asterisk', () => {
  assert.strictEqual(
    renderMarkdown('* one\n* two'),
    '<ul>\n<li>one</li>\n<li>two</li>\n</ul>'
  );
});

test('unordered list with plus', () => {
  assert.strictEqual(
    renderMarkdown('+ one\n+ two'),
    '<ul>\n<li>one</li>\n<li>two</li>\n</ul>'
  );
});

test('ordered list', () => {
  assert.strictEqual(
    renderMarkdown('1. one\n2. two'),
    '<ol>\n<li>one</li>\n<li>two</li>\n</ol>'
  );
});

test('nested unordered list', () => {
  const md = '- a\n  - a1\n  - a2\n- b';
  const out = renderMarkdown(md);
  assert.strictEqual(
    out,
    '<ul>\n<li>a<ul>\n<li>a1</li>\n<li>a2</li>\n</ul></li>\n<li>b</li>\n</ul>'
  );
});

test('list item content has inline formatting', () => {
  assert.strictEqual(
    renderMarkdown('- **bold** item'),
    '<ul>\n<li><strong>bold</strong> item</li>\n</ul>'
  );
});

test('XSS: raw script tag in paragraph does not produce script tag', () => {
  const out = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!/<script/i.test(out), `Found script tag in output: ${out}`);
});

test('XSS: img onerror does not produce active img', () => {
  const out = renderMarkdown('<img src=x onerror=alert(1)>');
  // The literal text "onerror" may survive as escaped paragraph content;
  // what matters is that the browser never sees an actual <img> element.
  assert.ok(!/<img/i.test(out), `Found img tag in output: ${out}`);
  assert.ok(out.includes('&lt;img'), `Expected escaped <img, got: ${out}`);
});

test('XSS: javascript URL in link text', () => {
  const out = renderMarkdown('[click](javascript:alert(1))');
  assert.ok(!/javascript:/i.test(out));
});

test('newlines preserved between blocks', () => {
  const out = renderMarkdown('# Title\n\nparagraph');
  assert.strictEqual(out, '<h1>Title</h1>\n<p>paragraph</p>');
});

test('empty input renders empty string', () => {
  assert.strictEqual(renderMarkdown(''), '');
});

test('only whitespace renders empty string', () => {
  assert.strictEqual(renderMarkdown('   \n\n  '), '');
});

test('combined: heading, paragraph, list, code', () => {
  const md = '# Title\n\nPara with **bold**.\n\n- item one\n- item two\n\n```\ncode\n```';
  const out = renderMarkdown(md);
  assert.ok(out.includes('<h1>Title</h1>'));
  assert.ok(out.includes('<p>Para with <strong>bold</strong>.</p>'));
  assert.ok(out.includes('<ul>'));
  assert.ok(out.includes('<li>item one</li>'));
  assert.ok(out.includes('<pre><code>code\n</code></pre>'));
});

// End-to-end wiring test: simulate the browser DOM/timers and confirm the
// page-level bootstrap script wires the textarea to the preview through a
// debounce that fires within 250ms of a keystroke.
test('live preview wiring debounces and fires within 250ms', () => {
  const html = fs.readFileSync(path.join(__dirname, 'markdown.html'), 'utf8');
  // Two <script> blocks: id="parser" (the parser) and the unnamed bootstrap.
  const scripts = [...html.matchAll(/<script(?:\s+id="([^"]+)")?[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 2, 'expected at least 2 script blocks');
  const parserSrc = scripts.find(m => m[1] === 'parser')[2];
  const bootstrapSrc = scripts.find(m => m[1] !== 'parser')[2];

  // Fake DOM elements
  const input = { value: 'hello', _listeners: {} };
  input.addEventListener = (ev, fn) => { input._listeners[ev] = fn; };
  const preview = { innerHTML: '' };
  const doc = {
    getElementById: id => id === 'input' ? input : id === 'preview' ? preview : null
  };
  // Virtual clock
  let now = 0;
  const pending = []; // [{when, fn, id, cancelled}]
  let nextId = 1;
  const sandbox = {
    document: doc,
    window: {},
    module: { exports: {} },
    setTimeout: (fn, delay) => {
      const id = nextId++;
      pending.push({ when: now + delay, fn, id, cancelled: false });
      return id;
    },
    clearTimeout: id => {
      const p = pending.find(x => x.id === id);
      if (p) p.cancelled = true;
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  // Parser script attaches to module.exports (since module is defined). We
  // also need it on `window` for the bootstrap to find it.
  vm.runInContext(parserSrc, sandbox);
  sandbox.window.renderMarkdown = sandbox.module.exports.renderMarkdown;
  vm.runInContext(bootstrapSrc, sandbox);

  // Initial render runs synchronously on load.
  assert.strictEqual(preview.innerHTML, '<p>hello</p>');

  // Simulate a keystroke. The handler should schedule a debounced render;
  // the preview should still show the OLD content immediately.
  input.value = '# new';
  input._listeners.input();
  assert.strictEqual(preview.innerHTML, '<p>hello</p>', 'no render before debounce');

  // Find the soonest non-cancelled scheduled timer.
  const active = pending.filter(p => !p.cancelled);
  assert.ok(active.length > 0, 'expected a scheduled timer');
  const soonest = active.reduce((a, b) => b.when < a.when ? b : a);
  assert.ok(soonest.when <= 250, `debounce delay ${soonest.when}ms exceeds 250ms requirement`);

  // Advance to the timer and fire it.
  now = soonest.when;
  soonest.fn();
  assert.strictEqual(preview.innerHTML, '<h1>new</h1>', 'preview should update after debounce');
});

// XSS via the full HTML pipeline (escape + render).
test('XSS: rendered output contains no executable script element', () => {
  const out = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(2)>');
  assert.ok(!/<script/i.test(out));
  assert.ok(!/<img/i.test(out));
  assert.ok(!/onerror=/i.test(out) || out.indexOf('&lt;img') !== -1);
});

test('XSS: link with newline-obfuscated javascript scheme', () => {
  const out = renderMarkdown('[x](java\nscript:alert(1))');
  // Newline-broken schemes won't match the URL grammar (no embedded ) anyway)
  // but the test confirms no anchor tag is generated.
  assert.ok(!/<a [^>]*javascript/i.test(out));
});
