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

test('escapes ampersands', () => {
  const out = parseMarkdown('A & B');
  assert.ok(out.includes('A &amp; B'));
});

test('escapes quotes', () => {
  const out = parseMarkdown('"hello" \'world\'');
  assert.ok(out.includes('&quot;hello&quot;'));
  assert.ok(out.includes('&#39;world&#39;'));
});

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

test('> line produces <blockquote>', () => {
  const out = parseMarkdown('> quoted');
  assert.ok(/<blockquote>[\s\S]*quoted[\s\S]*<\/blockquote>/.test(out));
});
test('multi-line blockquote merges', () => {
  const out = parseMarkdown('> a\n> b');
  assert.ok(/<blockquote>[\s\S]*a[\s\S]*b[\s\S]*<\/blockquote>/.test(out));
});

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
  assert.ok(/<ul>\s*<li>a\s*<ul>\s*<li>a1<\/li>\s*<\/ul>\s*<\/li>\s*<li>b<\/li>\s*<\/ul>/.test(out));
});

test('ordered list renders <ol><li>', () => {
  const out = parseMarkdown('1. one\n2. two\n3. three');
  assert.ok(/<ol>\s*<li>one<\/li>\s*<li>two<\/li>\s*<li>three<\/li>\s*<\/ol>/.test(out));
});

test('**bold** -> <strong>', () => {
  assert.ok(/<strong>bold<\/strong>/.test(parseMarkdown('**bold**')));
});
test('*italic* -> <em>', () => {
  assert.ok(/<em>italic<\/em>/.test(parseMarkdown('*italic*')));
});
test('_italic_ -> <em>', () => {
  assert.ok(/<em>italic<\/em>/.test(parseMarkdown('_italic_')));
});
test('***bolditalic*** -> <strong><em>', () => {
  const out = parseMarkdown('***hi***');
  assert.ok(/<strong><em>hi<\/em><\/strong>/.test(out));
});
test('`code` -> <code>', () => {
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
});
test('data: URL is neutralized', () => {
  const out = parseMarkdown('[x](data:text/html,<script>alert(1)</script>)');
  assert.ok(!/href="data:/i.test(out));
});
test('relative URL allowed', () => {
  const out = parseMarkdown('[x](/foo/bar)');
  assert.ok(/href="\/foo\/bar"/.test(out));
});
test('link text can contain emphasis', () => {
  const out = parseMarkdown('[**bold link**](https://e.com)');
  assert.ok(/<a href="https:\/\/e\.com"><strong>bold link<\/strong><\/a>/.test(out));
});

test('image syntax with javascript: URL is inert', () => {
  const out = parseMarkdown('![x](javascript:alert(1))');
  assert.ok(!/<img/i.test(out));
});
test('control char smuggling: null byte is stripped', () => {
  const out = parseMarkdown('hello\x00world');
  assert.ok(out.includes('helloworld'));
});
test('placeholder collision: user types our sentinel char', () => {
  const out = parseMarkdown('\x01C0\x02');
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
  assert.ok(/<h1>Title<\/h1>/.test(out), 'h1');
  assert.ok(/<strong>bold<\/strong>/.test(out), 'bold');
  assert.ok(/<em>italic<\/em>/.test(out), 'italic');
  assert.ok(/<ul>[\s\S]*<li>one<\/li>/.test(out), 'ul');
  assert.ok(/<ol>[\s\S]*<li>first<\/li>/.test(out), 'ol');
  assert.ok(/<blockquote>/.test(out), 'blockquote');
  assert.ok(/<pre><code>code &lt;here&gt;\n?<\/code><\/pre>/.test(out), 'pre/code');
  assert.ok(/<a href="https:\/\/example\.com">link<\/a>/.test(out), 'link');
});

module.exports = { parseMarkdown };
