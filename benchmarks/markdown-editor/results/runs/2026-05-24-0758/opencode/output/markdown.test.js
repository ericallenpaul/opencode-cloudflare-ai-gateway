import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

function loadParserFromHtml() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirnameLocal = path.dirname(__filename);
  const htmlPath = path.resolve(__dirnameLocal, 'markdown.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = /\/\* MARKDOWN_PARSER_START \*\/([\s\S]*?)\/\* MARKDOWN_PARSER_END \*\//.exec(html);
  if (!m) throw new Error('Parser block not found in markdown.html');
  const code = m[1];
  const context = vm.createContext({ console, globalThis: {} });
  new vm.Script(code, { filename: 'parser.js' }).runInContext(context);
  return context.globalThis.Markdown;
}

function normalize(html) {
  return html.replace(/\s+/g, ' ').trim();
}

test('headings h1..h6', () => {
  const { parse } = loadParserFromHtml();
  const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
  const out = normalize(parse(md));
  assert.match(out, /<h1>H1<\/h1>/);
  assert.match(out, /<h2>H2<\/h2>/);
  assert.match(out, /<h3>H3<\/h3>/);
  assert.match(out, /<h4>H4<\/h4>/);
  assert.match(out, /<h5>H5<\/h5>/);
  assert.match(out, /<h6>H6<\/h6>/);
});

test('emphasis: bold, italic, bold+italic', () => {
  const { parse } = loadParserFromHtml();
  const md = '**b** *i* _i_ ***bi***';
  const out = normalize(parse(md));
  assert.match(out, /<p><strong>b<\/strong> <em>i<\/em> <em>i<\/em> <strong><em>bi<\/em><\/strong><\/p>/);
});

test('inline code and fenced code blocks escape HTML', () => {
  const { parse } = loadParserFromHtml();
  const md = 'Here is `\n<em>x</em>`\n\n```\n<script>alert(1)<\/script>\n```';
  const out = normalize(parse(md));
  assert.match(out, /<code>&lt;em&gt;x&lt;\/em&gt;<\/code>/);
  assert.match(out, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/);
});

test('unordered lists and one-level nesting', () => {
  const { parse } = loadParserFromHtml();
  const md = '- a\n  - a1\n- b\n* c\n+ d';
  const out = normalize(parse(md));
  assert.match(out, /<ul>\s*<li>a<ul>\s*<li>a1<\/li>\s*<\/ul><\/li>\s*<li>b<\/li>\s*<li>c<\/li>\s*<li>d<\/li>\s*<\/ul>/);
});

test('ordered lists', () => {
  const { parse } = loadParserFromHtml();
  const md = '1. first\n2. second';
  const out = normalize(parse(md));
  assert.match(out, /<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>/);
});

test('inline links sanitize unsafe schemes', () => {
  const { parse } = loadParserFromHtml();
  const safe = '[site](https://example.com)';
  const unsafe = '[xss](javascript:alert(1))';
  const out = normalize(parse(safe + ' ' + unsafe));
  assert.match(out, /<a href=\"https:\/\/example.com\"[^>]*>site<\/a>/);
  // Unsafe becomes non-active text span
  assert.match(out, /<span class=\"invalid-link\">xss \(javascript:alert\(1\)\)<\/span>/);
});

test('blockquotes render inner paragraphs', () => {
  const { parse } = loadParserFromHtml();
  const md = '> quote line 1\n> quote line 2';
  const out = normalize(parse(md));
  assert.match(out, /<blockquote>\s*<p>quote line 1 quote line 2<\/p>\s*<\/blockquote>/);
});

test('raw HTML is escaped (no active script or img handlers)', () => {
  const { parse } = loadParserFromHtml();
  const md = '<script>alert(1)<\/script>\n<img src=x onerror=alert(1)>';
  const out = normalize(parse(md));
  assert.ok(!out.includes('<script>'));
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
