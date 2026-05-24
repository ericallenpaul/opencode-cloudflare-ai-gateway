'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const htmlPath = path.join(__dirname, 'markdown.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const m = html.match(/\/\/ PARSER_START([\s\S]*?)\/\/ PARSER_END/);
if (!m) throw new Error('PARSER_START/PARSER_END markers not found in markdown.html');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.renderMarkdown = renderMarkdown; this.escapeHtml = (typeof escapeHtml==="function")?escapeHtml:null;', ctx);

test('parser exposes renderMarkdown function', () => {
  assert.equal(typeof ctx.renderMarkdown, 'function');
});

// --- HTML escape baseline ---
test('escapes < > & " in plain text', () => {
  const out = ctx.renderMarkdown('a < b & c > d "e"');
  assert.match(out, /&lt;/);
  assert.match(out, /&gt;/);
  assert.match(out, /&amp;/);
  assert.match(out, /&quot;/);
});

test('raw <script> tag does not execute or appear as live HTML', () => {
  const out = ctx.renderMarkdown('<script>alert(1)</script>');
  assert.doesNotMatch(out, /<script/i);
  assert.match(out, /&lt;script/);
});

test('img onerror is escaped, not rendered', () => {
  const out = ctx.renderMarkdown('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(out, /<img/i);
  assert.match(out, /&lt;img/);
});

// --- Headings ---
test('renders H1 through H6 from # … ######', () => {
  for (let n = 1; n <= 6; n++) {
    const src = '#'.repeat(n) + ' Title';
    const out = ctx.renderMarkdown(src);
    assert.match(out, new RegExp('<h' + n + '>Title</h' + n + '>'));
  }
});

test('escapes content inside heading', () => {
  const out = ctx.renderMarkdown('# <script>x</script>');
  assert.match(out, /<h1>&lt;script/);
  assert.doesNotMatch(out, /<script/i);
});

test('seven hashes is not a heading', () => {
  const out = ctx.renderMarkdown('####### too many');
  assert.doesNotMatch(out, /<h[1-7]\b/);
});

// --- Fenced code blocks ---
test('renders fenced code block with html-escaped content', () => {
  const out = ctx.renderMarkdown('```\n<b>x</b>\n```');
  assert.match(out, /<pre><code>/);
  assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);
});

test('inline markup inside fenced code is not transformed', () => {
  const out = ctx.renderMarkdown('```\n**bold** *i*\n```');
  assert.doesNotMatch(out, /<strong>/);
  assert.match(out, /\*\*bold\*\*/);
});

// --- Blockquotes ---
test('renders blockquote line', () => {
  const out = ctx.renderMarkdown('> hello');
  assert.match(out, /<blockquote>[\s\S]*hello[\s\S]*<\/blockquote>/);
});

test('escapes inside blockquote', () => {
  const out = ctx.renderMarkdown('> <script>x</script>');
  assert.doesNotMatch(out, /<script[^&]/i);
  assert.match(out, /&lt;script/);
});

// --- Unordered lists with nesting ---
test('renders top-level unordered list (-, *, +)', () => {
  const out = ctx.renderMarkdown('- a\n- b\n* c\n+ d');
  assert.match(out, /<ul>/);
  assert.match(out, /<li>a<\/li>/);
  assert.match(out, /<li>b<\/li>/);
  assert.match(out, /<li>c<\/li>/);
  assert.match(out, /<li>d<\/li>/);
});

test('renders one level of nested unordered list', () => {
  const out = ctx.renderMarkdown('- a\n  - a1\n  - a2\n- b');
  assert.match(out, /<li>a<ul><li>a1<\/li><li>a2<\/li><\/ul><\/li>/);
  assert.match(out, /<li>b<\/li>/);
});

// --- Ordered lists ---
test('renders ordered list', () => {
  const out = ctx.renderMarkdown('1. one\n2. two\n3. three');
  assert.match(out, /<ol>/);
  assert.match(out, /<li>one<\/li>/);
  assert.match(out, /<li>two<\/li>/);
  assert.match(out, /<li>three<\/li>/);
});

// --- Inline formatting ---
test('bold **x**', () => {
  const out = ctx.renderMarkdown('**x**');
  assert.match(out, /<strong>x<\/strong>/);
});

test('italic *y* and _z_', () => {
  const out1 = ctx.renderMarkdown('*y*');
  assert.match(out1, /<em>y<\/em>/);
  const out2 = ctx.renderMarkdown('_z_');
  assert.match(out2, /<em>z<\/em>/);
});

test('bold-italic ***x***', () => {
  const out = ctx.renderMarkdown('***x***');
  assert.match(out, /<strong><em>x<\/em><\/strong>|<em><strong>x<\/strong><\/em>/);
});

test('inline code `x` does not transform inner markup', () => {
  const out = ctx.renderMarkdown('`**x**`');
  assert.match(out, /<code>\*\*x\*\*<\/code>/);
});

test('inline link with safe URL', () => {
  const out = ctx.renderMarkdown('[hi](https://example.com)');
  assert.match(out, /<a href="https:\/\/example\.com">hi<\/a>/);
});

test('inline link with javascript: URL is sanitized', () => {
  const out = ctx.renderMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(out, /javascript:/i);
  assert.match(out, /href="#"/);
});

test('inline link with data: URL is sanitized', () => {
  const out = ctx.renderMarkdown('[x](data:text/html,<script>)');
  assert.doesNotMatch(out, /data:/i);
});

test('inline link with vbscript: URL is sanitized', () => {
  const out = ctx.renderMarkdown('[x](vbscript:msgbox)');
  assert.doesNotMatch(out, /vbscript:/i);
});

// --- Combined sanity ---
test('mixed document: heading + paragraph + list + code', () => {
  const src = '# Title\n\nPara with **bold** and *em*.\n\n- one\n- two\n\n```\ncode\n```';
  const out = ctx.renderMarkdown(src);
  assert.match(out, /<h1>Title<\/h1>/);
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<em>em<\/em>/);
  assert.match(out, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(out, /<pre><code>code\n?<\/code><\/pre>/);
});
