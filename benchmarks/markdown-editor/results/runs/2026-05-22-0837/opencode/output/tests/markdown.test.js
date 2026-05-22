const test = require('node:test');
const assert = require('node:assert/strict');

// Intentionally require before implementation exists to follow TDD
const { renderMarkdown } = require('../src/parser');

test('ATX headings #..###### render to h1..h6', () => {
  const md = `# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6`;
  const html = renderMarkdown(md).replace(/\n/g, '');
  assert.match(html, /<h1>H1<\/h1>/);
  assert.match(html, /<h2>H2<\/h2>/);
  assert.match(html, /<h3>H3<\/h3>/);
  assert.match(html, /<h4>H4<\/h4>/);
  assert.match(html, /<h5>H5<\/h5>/);
  assert.match(html, /<h6>H6<\/h6>/);
});

// Emphasis and strong
const emphasisCases = [
  { md: '*em*', rx: /<em>em<\/em>/ },
  { md: '_em_', rx: /<em>em<\/em>/ },
  { md: '**strong**', rx: /<strong>strong<\/strong>/ },
  { md: '__strong__', rx: /<strong>strong<\/strong>/ },
  { md: '***both***', rx: /<strong><em>both<\/em><\/strong>/ },
];
for (const { md, rx } of emphasisCases) {
  test(`emphasis variant: ${md}`, () => {
    const html = renderMarkdown(md);
    assert.match(html, rx);
  });
}

// Links and URL sanitization
test('links: allow http/https/mailto, block javascript:', () => {
  const safe1 = renderMarkdown('[x](https://example.com)');
  assert.match(safe1, /<a href=\"https:\/\/example.com\">x<\/a>/);
  const safe2 = renderMarkdown('[mail](mailto:test@example.com)');
  assert.match(safe2, /<a href=\"mailto:test@example.com\">mail<\/a>/);
  const bad = renderMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(bad, /<a\b[^>]*href=/);
  // ensure original text remains visible, not turned into a link
  assert.match(bad, />\[x\]\(javascript:alert\(1\)\)<\//);
});

// Inline code and fenced code blocks
test('inline code uses <code> and escapes', () => {
  const html = renderMarkdown('Use `x<y`');
  assert.match(html, /<code>x&lt;y<\/code>/);
});

test('fenced code blocks with ``` are preserved/escaped', () => {
  const md = '```\n<em>x</em>\n```';
  const html = renderMarkdown(md).replace(/\n/g, '');
  assert.match(html, /<pre><code>&lt;em&gt;x&lt;\/em&gt;<\/code><\/pre>/);
});

// Lists
test('unordered list and nested one level', () => {
  const md = '- a\n  - b';
  const html = renderMarkdown(md).replace(/\n/g, '');
  assert.match(html, /<ul>\s*<li>a(?:.|\s)*<ul>\s*<li>b<\/li>\s*<\/ul>\s*<\/li>\s*<\/ul>/);
});

test('ordered list', () => {
  const md = '1. first\n2. second';
  const html = renderMarkdown(md).replace(/\n/g, '');
  assert.match(html, /<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>/);
});

// Blockquotes
test('blockquotes render with inline parsing', () => {
  const md = '> quote with *em*';
  const html = renderMarkdown(md).replace(/\n/g, '');
  assert.match(html, /<blockquote>\s*<p>quote with <em>em<\/em><\/p>\s*<\/blockquote>/);
});

// XSS
test('raw HTML is escaped (scripts/img handlers inert)', () => {
  const md = '<script>alert(1)<\/script>\n<img src=x onerror=alert(1) />';
  const html = renderMarkdown(md);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\) \/&gt;/);
});
