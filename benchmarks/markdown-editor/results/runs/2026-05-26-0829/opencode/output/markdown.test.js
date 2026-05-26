import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadParser() {
  const html = fs.readFileSync('markdown.html', 'utf8');
  const m = html.match(/START_PARSER[\s\S]*?END_PARSER/);
  if (!m) throw new Error('Parser block not found');
  const code = m[0]
    .replace(/^.*START_PARSER.*$/m, '')
    .replace(/^.*END_PARSER.*$/m, '');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'parser.js' });
  if (typeof ctx.parseMarkdown !== 'function') throw new Error('parseMarkdown missing');
  return ctx;
}

const { parseMarkdown, sanitizeHref } = loadParser();

test('escapes raw HTML including script tags', () => {
  const out = parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1) />');
  assert.ok(!out.includes('<script>'));
  assert.match(out, /&lt;script&gt;.*&lt;\/script&gt;/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\) \/&gt;/);
});

test('ATX headings h1..h6', () => {
  const out = parseMarkdown('# H1\n## H2\n###### H6');
  assert.match(out, /<h1>H1<\/h1>/);
  assert.match(out, /<h2>H2<\/h2>/);
  assert.match(out, /<h6>H6<\/h6>/);
});

test('bold, italic, bold+italic', () => {
  const out = parseMarkdown('***a*** **b** *c* _d_');
  assert.match(out, /<strong><em>a<\/em><\/strong>/);
  assert.match(out, /<strong>b<\/strong>/);
  assert.match(out, /<em>c<\/em>/);
  assert.match(out, /<em>d<\/em>/);
});

test('unordered lists with one level nesting', () => {
  const md = '- a\n  - b\n- c';
  const out = parseMarkdown(md);
  // Expect two ULs (one nested)
  assert.ok(out.includes('<ul>'));
  // Order of LIs
  assert.match(out, /<ul>[\s\S]*<li>a<\/li>[\s\S]*<ul>[\s\S]*<li>b<\/li>[\s\S]*<\/ul>[\s\S]*<li>c<\/li>[\s\S]*<\/ul>/);
});

test('ordered lists', () => {
  const md = '1. one\n2. two';
  const out = parseMarkdown(md);
  assert.match(out, /<ol>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ol>/);
});

test('inline code and fenced code blocks', () => {
  const md = 'Here is `x < y`\n\n```\n<script>alert(1)</script>\n```';
  const out = parseMarkdown(md);
  assert.match(out, /Here is <code>x &lt; y<\/code>/);
  assert.match(out, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;[\s\S]*<\/code><\/pre>/);
});

test('links are sanitized; javascript: blocked', () => {
  const safe = parseMarkdown('[ok](https://example.com)');
  assert.match(safe, /<a href="https:\/\/example.com" rel="noopener noreferrer" target="_blank">ok<\/a>/);
  const bad = parseMarkdown('[bad](javascript:alert(1))');
  assert.match(bad, /<a href="#">bad<\/a>/);
  assert.ok(!bad.includes('javascript:'));
});

test('blockquotes', () => {
  const out = parseMarkdown('> q1\n> q2');
  assert.match(out, /<blockquote>[\s\S]*<p>q1<\/p>[\s\S]*<p>q2<\/p>[\s\S]*<\/blockquote>/);
});
