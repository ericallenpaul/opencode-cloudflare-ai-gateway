const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, 'markdown.html');

function readHtml() {
  return fs.readFileSync(htmlPath, 'utf8');
}

function loadEngine() {
  const html = readHtml();
  const match = html.match(/<script id="markdown-engine">([\s\S]*?)<\/script>/);
  assert.ok(match, 'markdown.html must contain <script id="markdown-engine">');

  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(match[1], context, { filename: 'markdown-engine.js' });

  assert.ok(context.window.MarkdownEditor, 'MarkdownEditor API must be exposed on window');
  return context.window.MarkdownEditor;
}

test('renders headings and inline formatting', () => {
  const { renderMarkdown } = loadEngine();
  const html = renderMarkdown('# Title\n\nThis is **bold**, *italic*, _also italic_, ***both***, and `code`.');

  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<em>also italic<\/em>/);
  assert.match(html, /<strong><em>both<\/em><\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test('renders all ATX heading levels and safe inline links', () => {
  const { renderMarkdown } = loadEngine();
  const html = renderMarkdown([
    '# One',
    '## Two',
    '### Three',
    '#### Four',
    '##### Five',
    '###### Six',
    '',
    '[Example](https://example.com/path?q=1)'
  ].join('\n'));

  assert.match(html, /<h1>One<\/h1>/);
  assert.match(html, /<h2>Two<\/h2>/);
  assert.match(html, /<h3>Three<\/h3>/);
  assert.match(html, /<h4>Four<\/h4>/);
  assert.match(html, /<h5>Five<\/h5>/);
  assert.match(html, /<h6>Six<\/h6>/);
  assert.match(html, /<a href="https:\/\/example\.com\/path\?q=1">Example<\/a>/);
});

test('renders unordered lists with one nested level and ordered lists', () => {
  const { renderMarkdown } = loadEngine();
  const html = renderMarkdown([
    '- parent',
    '  - nested',
    '* sibling',
    '+ another',
    '',
    '1. first',
    '2. second'
  ].join('\n'));

  assert.match(html, /<ul>[\s\S]*<li>parent[\s\S]*<ul>[\s\S]*<li>nested<\/li>[\s\S]*<\/ul>[\s\S]*<\/li>[\s\S]*<li>sibling<\/li>[\s\S]*<li>another<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<ol>[\s\S]*<li>first<\/li>[\s\S]*<li>second<\/li>[\s\S]*<\/ol>/);
});

test('renders fenced code blocks and blockquotes', () => {
  const { renderMarkdown } = loadEngine();
  const html = renderMarkdown([
    '```',
    '<script>alert("x")</script>',
    '**not bold**',
    '```',
    '',
    '> quoted **bold**',
    '> continued'
  ].join('\n'));

  assert.match(html, /<pre><code>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;\n\*\*not bold\*\*<\/code><\/pre>/);
  assert.doesNotMatch(html, /<strong>not bold<\/strong>/);
  assert.match(html, /<blockquote>[\s\S]*quoted <strong>bold<\/strong>[\s\S]*continued[\s\S]*<\/blockquote>/);
});

test('escapes raw HTML instead of rendering active elements', () => {
  const { renderMarkdown } = loadEngine();
  const html = renderMarkdown('<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>');

  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<img/i);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('neutralizes javascript URLs, including whitespace and entity obfuscation', () => {
  const { isSafeUrl, renderMarkdown } = loadEngine();

  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('JaVaScRiPt:alert(1)'), false);
  assert.equal(isSafeUrl('java\nscript:alert(1)'), false);
  assert.equal(isSafeUrl('javascript&#58;alert(1)'), false);
  assert.equal(isSafeUrl('jav&#x61;script:alert(1)'), false);

  const html = renderMarkdown('[bad](javascript:alert)\n\n[good](https://example.com)');
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /<p>bad<\/p>/);
  assert.match(html, /<a href="https:\/\/example\.com">good<\/a>/);
});

test('contains a self-contained dual-pane editor shell', () => {
  const html = readHtml();

  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel=["']?stylesheet/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|importScripts)\s*\(/);
  assert.match(html, /<textarea\b[^>]*\bid="markdown-input"/i);
  assert.match(html, /\bid="preview"/i);
  assert.match(html, /\baddEventListener\(["']input["']/);

  const delay = html.match(/\bLIVE_PREVIEW_DELAY_MS\s*=\s*(\d+)/);
  assert.ok(delay, 'LIVE_PREVIEW_DELAY_MS constant is required');
  assert.ok(Number(delay[1]) <= 250, 'live preview delay must be 250ms or less');
});
