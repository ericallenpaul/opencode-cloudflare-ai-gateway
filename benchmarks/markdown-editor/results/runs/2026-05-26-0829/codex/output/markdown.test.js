import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown, escapeHtml } from './markdown.testable.js';

test('escapeHtml encodes HTML significant characters', () => {
  assert.equal(
    escapeHtml(`<tag attr="quoted">'single' & value>`),
    '&lt;tag attr=&quot;quoted&quot;&gt;&#39;single&#39; &amp; value&gt;'
  );
});

test('renders ATX headings levels 1 through 6', () => {
  const html = renderMarkdown('# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six');
  assert.match(html, /<h1>One<\/h1>/);
  assert.match(html, /<h2>Two<\/h2>/);
  assert.match(html, /<h3>Three<\/h3>/);
  assert.match(html, /<h4>Four<\/h4>/);
  assert.match(html, /<h5>Five<\/h5>/);
  assert.match(html, /<h6>Six<\/h6>/);
});

test('renders emphasis combinations and inline code', () => {
  const html = renderMarkdown('***both*** **bold** *italic* _alt_ `code`');
  assert.match(html, /<strong><em>both<\/em><\/strong>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<em>alt<\/em>/);
  assert.match(html, /<code>code<\/code>/);
});

test('renders inline links with safe href attributes', () => {
  const html = renderMarkdown('[OpenAI](https://example.com/docs?q=1&lang=en)');
  assert.match(
    html,
    /<a href="https:\/\/example\.com\/docs\?q=1&amp;lang=en" target="_blank" rel="noopener noreferrer">OpenAI<\/a>/
  );
});

test('rejects javascript urls and escapes raw html', () => {
  const html = renderMarkdown(
    '[bad](javascript:alert(1))\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>'
  );
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<span class="unsafe-link">bad<\/span>/);
  assert.doesNotMatch(html, /unsafe-link">bad<\/span>\)/);
});

test('renders unordered and ordered lists with one nested level', () => {
  const html = renderMarkdown(
    '- alpha\n  - beta\n* gamma\n+ delta\n\n1. first\n2. second\n   1. child\n3. third'
  );
  assert.match(html, /<ul>/);
  assert.match(html, /<li>alpha<ul><li>beta<\/li><\/ul><\/li>/);
  assert.match(html, /<li>gamma<\/li>/);
  assert.match(html, /<li>delta<\/li>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<li>first<\/li>/);
  assert.match(html, /<li>second<ol><li>child<\/li><\/ol><\/li>/);
  assert.match(html, /<li>third<\/li>/);
});

test('renders fenced code blocks and preserves literal markdown inside them', () => {
  const html = renderMarkdown('```html\n<div class="x">**not bold**</div>\n```');
  assert.match(
    html,
    /<pre><code class="language-html">&lt;div class=&quot;x&quot;&gt;\*\*not bold\*\*&lt;\/div&gt;<\/code><\/pre>/
  );
});

test('renders blockquotes line by line', () => {
  const html = renderMarkdown('> quoted\n> still quoted\n\noutside');
  assert.match(html, /<blockquote><p>quoted<br>still quoted<\/p><\/blockquote>/);
  assert.match(html, /<p>outside<\/p>/);
});

test('wraps plain text paragraphs and preserves line breaks inside a paragraph', () => {
  const html = renderMarkdown('line one\nline two\n\nline three');
  assert.match(html, /<p>line one<br>line two<\/p>/);
  assert.match(html, /<p>line three<\/p>/);
});
