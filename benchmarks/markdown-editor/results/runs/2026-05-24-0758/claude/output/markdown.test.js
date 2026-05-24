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

test('h1', () => { assert.equal(render('# Hello'), '<h1>Hello</h1>'); });
test('h6', () => { assert.equal(render('###### x'), '<h6>x</h6>'); });
test('not heading without space', () => { assert.ok(render('#NoSpace').startsWith('<p>')); });
test('heading escapes content', () => {
  assert.equal(render('# <b>x</b>'), '<h1>&lt;b&gt;x&lt;/b&gt;</h1>');
});

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

test('blockquote', () => {
  assert.equal(render('> hi'), '<blockquote>hi</blockquote>');
});
test('multi-line blockquote', () => {
  assert.equal(render('> a\n> b'), '<blockquote>a\nb</blockquote>');
});
test('blockquote escapes html', () => {
  assert.ok(render('> <b>x').includes('&lt;b&gt;x'));
});

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

test('ordered list', () => {
  assert.equal(render('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
});
test('ordered list accepts any digits', () => {
  assert.equal(render('1. a\n5. b'), '<ol><li>a</li><li>b</li></ol>');
});

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

test('debounce delay is <= 250ms', () => {
  const m2 = html.match(/setTimeout\(\s*\(\)\s*=>[^,]+,\s*(\d+)\s*\)/);
  assert.ok(m2, 'debounce setTimeout not found');
  const delay = parseInt(m2[1], 10);
  assert.ok(delay <= 250, `debounce delay was ${delay}, must be <= 250`);
});
