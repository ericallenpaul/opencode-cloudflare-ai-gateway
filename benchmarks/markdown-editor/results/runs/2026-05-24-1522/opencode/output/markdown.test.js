const test = require('node:test');
const assert = require('node:assert/strict');

const { renderMarkdown } = require('./markdown.js');

const strip = s => String(s).replace(/\n+/g, '\n').trim();

test('ATX headings #..######', () => {
  assert.equal(strip(renderMarkdown('# H1')), '<h1>H1</h1>');
  assert.equal(strip(renderMarkdown('###### H6')), '<h6>H6</h6>');
});

test('bold, italic, bold+italic', () => {
  assert.equal(strip(renderMarkdown('This is **bold**')), '<p>This is <strong>bold</strong></p>');
  assert.equal(strip(renderMarkdown('This is *it* and _em_')), '<p>This is <em>it</em> and <em>em</em></p>');
  assert.equal(strip(renderMarkdown('***wow***')), '<p><strong><em>wow</em></strong></p>');
});

test('unordered and nested lists', () => {
  const md = '- A\n  - B\n- C';
  const html = strip(renderMarkdown(md));
  assert.equal(html, '<ul><li>A<ul><li>B</li></ul></li><li>C</li></ul>');
});

test('ordered lists', () => {
  const md = '1. One\n2. Two';
  const html = strip(renderMarkdown(md));
  assert.equal(html, '<ol><li>One</li><li>Two</li></ol>');
});

test('inline code and fenced code blocks', () => {
  assert.equal(strip(renderMarkdown('Use `code` here')), '<p>Use <code>code</code> here</p>');
  const md = '```\n<em>& stuff\n```';
  const html = strip(renderMarkdown(md));
  assert.equal(html, '<pre><code>&lt;em&gt;&amp; stuff\n</code></pre>');
});

test('inline links (safe) and drop unsafe javascript: URLs', () => {
  const safe = strip(renderMarkdown('[site](https://example.com)'));
  assert.equal(safe, '<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">site</a></p>');

  const unsafe = strip(renderMarkdown('[x](javascript:alert(1))'));
  // Should render just the text (no anchor)
  assert.equal(unsafe, '<p>x</p>');

  const unsafeWeirdCase = strip(renderMarkdown('[x](JaVaScRiPt:alert(1))'));
  assert.equal(unsafeWeirdCase, '<p>x</p>');
});

test('blockquotes', () => {
  const md = '> quote\n> more';
  const html = strip(renderMarkdown(md));
  assert.equal(html, '<blockquote><p>quote\nmore</p></blockquote>');
});

test('XSS: escape raw HTML like <script> and <img onerror>', () => {
  assert.equal(strip(renderMarkdown('<script>alert(1)</script>')), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(strip(renderMarkdown('<img src=x onerror=alert(1)>')), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});
