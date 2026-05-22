import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from './markdown.js';

test('h1 renders and HTML is escaped', () => {
  const md = '# Title\n\n<script>alert(1)</script>';
  const html = parseMarkdown(md);
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('XSS: scripts and images are inert', () => {
  const md = '<script>alert(1)</script> and <img src=x onerror=alert(1) /> and [x](javascript:alert(1))';
  const html = parseMarkdown(md);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\) \/&gt;/);
  assert.ok(!/href=\"javascript:/.test(html));
});

test('fenced code blocks', () => {
  const md = ['```', '<span> & **not bold**', '```'].join('\n');
  const html = parseMarkdown(md);
  assert.match(html, /<pre><code>[\s\S]*&lt;span&gt; &amp; \*\*not bold\*\*[\s\S]*<\/code><\/pre>/);
});

test('lists with one-level nesting', () => {
  const md = [
    '- A',
    '  - A.1',
    '- B',
    '1. One',
    '2. Two',
    '  1. Two.one'
  ].join('\n');
  const html = parseMarkdown(md);
  assert.match(html, /<ul>[\s\S]*<li>A<ul>[\s\S]*<li>A\.1<\/li>[\s\S]*<\/ul>[\s\S]*<\/li>[\s\S]*<li>B<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<ol>[\s\S]*<li>One<\/li>[\s\S]*<li>Two<ol>[\s\S]*<li>Two\.one<\/li>[\s\S]*<\/ol>[\s\S]*<\/li>[\s\S]*<\/ol>/);
});

test('blockquotes', () => {
  const md = ['> Quote line 1', '> and **bold**'].join('\n');
  const html = parseMarkdown(md);
  assert.match(html, /<blockquote>[\s\S]*<p>Quote line 1<br\/> and <strong>bold<\/strong><\/p>[\s\S]*<\/blockquote>/);
});

test('inline emphasis and code spans', () => {
  const md = '**bold** *it* _al_ and ***both*** and `x < y`';
  const html = parseMarkdown(md);
  assert.match(html, /<p>.*<strong>bold<\/strong>.*<em>it<\/em>.*<em>al<\/em>.*<strong><em>both<\/em><\/strong>.*<code>x &lt; y<\/code>.*<\/p>/);
});

test('links: safe vs unsafe', () => {
  const safe = '[ok](https://example.com/x?y=1) and [rel](/path) and [mail](mailto:me@example.com)';
  const safeHtml = parseMarkdown(safe);
  assert.match(safeHtml, /<a href=\"https:\/\/example.com\/x\?y=1\">ok<\/a>/);
  assert.match(safeHtml, /<a href=\"\/path\">rel<\/a>/);
  assert.match(safeHtml, /<a href=\"mailto:me@example.com\">mail<\/a>/);

  const unsafe = '[nope](javascript:alert(1)) and [Nope](JaVaScRiPt:alert(1))';
  const unsafeHtml = parseMarkdown(unsafe);
  assert.ok(!/<a [^>]*>nope<\/a>/.test(unsafeHtml));
  assert.ok(!/<a [^>]*>Nope<\/a>/.test(unsafeHtml));
});
