// Tests for the markdown parser embedded in markdown.html.
// Run with:   node --test markdown.test.js
//
// The parser is loaded directly from markdown.html by extracting the
// code between the /* PARSER:START */ and /* PARSER:END */ markers and
// evaluating it inside a sandboxed vm context. This guarantees we are
// testing exactly the code that ships in the HTML file.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML_PATH = path.join(__dirname, "markdown.html");
const html = fs.readFileSync(HTML_PATH, "utf8");

const START = "/* PARSER:START */";
const END = "/* PARSER:END */";
const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  throw new Error("Could not locate parser markers in markdown.html");
}
const parserSrc = html.slice(startIdx + START.length, endIdx);

const ctx = vm.createContext({});
vm.runInContext(parserSrc + "\nglobalThis.renderMarkdown = renderMarkdown;", ctx);
const renderMarkdown = ctx.renderMarkdown;

function render(md) { return renderMarkdown(md); }

// --------------------- baseline ---------------------

test("empty string returns empty string", () => {
  assert.equal(render(""), "");
});

test("non-string input returns empty string", () => {
  assert.equal(render(null), "");
  assert.equal(render(undefined), "");
  assert.equal(render(42), "");
});

// --------------------- escaping ---------------------

test("raw <script> tag is escaped and does not appear as a tag", () => {
  const out = render("<script>alert(1)</script>");
  assert.ok(!/<script>/i.test(out), "raw <script> tag must not appear: " + out);
  assert.ok(out.includes("&lt;script&gt;"));
});

test("img with onerror is escaped", () => {
  const out = render('<img src=x onerror="alert(1)">');
  assert.ok(!/<img\b/i.test(out), "raw <img> tag must not appear: " + out);
  assert.ok(out.includes("&lt;img"));
});

test("ampersand and quotes are escaped", () => {
  const out = render("a & b \"c\" 'd'");
  assert.ok(out.includes("&amp;"));
  assert.ok(out.includes("&quot;") || out.includes("&#34;"));
});

// --------------------- headings ---------------------

test("H1 through H6", () => {
  assert.ok(render("# H1").includes("<h1>H1</h1>"));
  assert.ok(render("## H2").includes("<h2>H2</h2>"));
  assert.ok(render("### H3").includes("<h3>H3</h3>"));
  assert.ok(render("#### H4").includes("<h4>H4</h4>"));
  assert.ok(render("##### H5").includes("<h5>H5</h5>"));
  assert.ok(render("###### H6").includes("<h6>H6</h6>"));
});

test("seven hashes is not a heading", () => {
  const out = render("####### nope");
  assert.ok(!/<h[1-7]\b/.test(out), "should not become a heading: " + out);
});

test("hash without space is not a heading", () => {
  const out = render("#NoSpace");
  assert.ok(!/<h1\b/.test(out), "should not be a heading: " + out);
});

test("heading with trailing closing hashes is allowed", () => {
  const out = render("# Title ##");
  assert.ok(out.includes("<h1>Title</h1>"));
});

// --------------------- paragraphs ---------------------

test("two paragraphs separated by blank line", () => {
  const out = render("hello\n\nworld");
  assert.ok(out.includes("<p>hello</p>"));
  assert.ok(out.includes("<p>world</p>"));
});

test("single paragraph", () => {
  const out = render("just a sentence");
  assert.ok(out.includes("<p>just a sentence</p>"));
});

// --------------------- emphasis ---------------------

test("bold with asterisks", () => {
  assert.ok(render("**bold**").includes("<strong>bold</strong>"));
});

test("bold with underscores", () => {
  assert.ok(render("__bold__").includes("<strong>bold</strong>"));
});

test("italic with asterisks", () => {
  assert.ok(render("*italic*").includes("<em>italic</em>"));
});

test("italic with underscores", () => {
  assert.ok(render("_italic_").includes("<em>italic</em>"));
});

test("bold-italic with triple markers", () => {
  const a = render("***both***");
  assert.ok(/<strong><em>both<\/em><\/strong>/.test(a), "asterisks bold-italic: " + a);
  const b = render("___both___");
  assert.ok(/<strong><em>both<\/em><\/strong>/.test(b), "underscore bold-italic: " + b);
});

test("unmatched asterisk stays literal", () => {
  const out = render("*foo");
  assert.ok(!/<em>/.test(out), "should not produce em: " + out);
  assert.ok(out.includes("*foo"));
});

test("emphasis in headings", () => {
  const out = render("# **Big** _Idea_");
  assert.ok(out.includes("<strong>Big</strong>"));
  assert.ok(out.includes("<em>Idea</em>"));
});

// --------------------- inline code ---------------------

test("inline code", () => {
  assert.ok(render("`code`").includes("<code>code</code>"));
});

test("inline code escapes HTML", () => {
  const out = render("`<script>`");
  assert.ok(out.includes("<code>&lt;script&gt;</code>"));
  assert.ok(!/<script>/i.test(out));
});

test("inline code is not further processed for markdown", () => {
  const out = render("`**not bold**`");
  assert.ok(out.includes("<code>**not bold**</code>"));
  assert.ok(!/<strong>/.test(out));
});

// --------------------- fenced code blocks ---------------------

test("fenced code block", () => {
  const out = render("```\nline1\nline2\n```");
  assert.ok(/<pre><code>line1\nline2\n<\/code><\/pre>/.test(out), out);
});

test("fenced code block with language", () => {
  const out = render("```js\nvar x=1;\n```");
  assert.ok(/<pre><code class="language-js">var x=1;\n<\/code><\/pre>/.test(out), out);
});

test("fenced code escapes HTML inside", () => {
  const out = render("```\n<script>alert(1)</script>\n```");
  assert.ok(!/<script>/i.test(out));
  assert.ok(out.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("fenced code does not process inline markdown", () => {
  const out = render("```\n**not bold**\n```");
  assert.ok(out.includes("**not bold**"));
  assert.ok(!/<strong>/.test(out));
});

// --------------------- links ---------------------

test("inline link", () => {
  const out = render("[click](https://example.com)");
  assert.ok(/<a href="https:\/\/example\.com">click<\/a>/.test(out), out);
});

test("link with http", () => {
  const out = render("[x](http://example.com/path)");
  assert.ok(out.includes('<a href="http://example.com/path">x</a>'));
});

test("link with relative path", () => {
  const out = render("[x](/foo/bar)");
  assert.ok(out.includes('href="/foo/bar"'));
});

test("link with anchor", () => {
  const out = render("[x](#section)");
  assert.ok(out.includes('href="#section"'));
});

test("link with mailto", () => {
  const out = render("[email](mailto:a@b.com)");
  assert.ok(out.includes('href="mailto:a@b.com"'));
});

test("javascript: URL is sanitized", () => {
  const out = render("[evil](javascript:alert(1))");
  assert.ok(!/javascript:/i.test(out), "javascript: should not appear in output: " + out);
});

test("case-variant javascript: URL is sanitized", () => {
  const out = render("[evil](JaVaScRiPt:alert(1))");
  assert.ok(!/javascript:/i.test(out), out);
});

test("javascript: with leading whitespace is sanitized", () => {
  const out = render("[evil](   javascript:alert(1))");
  assert.ok(!/javascript:/i.test(out), out);
});

test("data: URL is sanitized", () => {
  const out = render("[x](data:text/html,<script>alert(1)</script>)");
  assert.ok(!/data:text\/html/i.test(out), out);
});

test("vbscript: URL is sanitized", () => {
  const out = render("[x](vbscript:msgbox(1))");
  assert.ok(!/vbscript:/i.test(out), out);
});

test("link URL is HTML-attribute-escaped (cannot break out of quotes)", () => {
  const out = render('[x](http://a.com"onmouseover=alert\\(1\\) )');
  // Should not contain an unescaped quote that would break out of href
  assert.ok(!/href="[^"]*"[^>]*onmouseover/i.test(out), out);
});

// --------------------- blockquotes ---------------------

test("simple blockquote", () => {
  const out = render("> quoted");
  assert.ok(/<blockquote>/.test(out));
  assert.ok(out.includes("quoted"));
});

test("multi-line blockquote", () => {
  const out = render("> line one\n> line two");
  assert.ok(/<blockquote>/.test(out));
  assert.ok(out.includes("line one"));
  assert.ok(out.includes("line two"));
});

test("blockquote processes inline markdown", () => {
  const out = render("> **bold** in quote");
  assert.ok(/<blockquote>/.test(out));
  assert.ok(out.includes("<strong>bold</strong>"));
});

// --------------------- unordered lists ---------------------

test("simple unordered list with -", () => {
  const out = render("- a\n- b");
  assert.ok(/<ul>/.test(out));
  assert.ok(out.includes("<li>a</li>"));
  assert.ok(out.includes("<li>b</li>"));
});

test("unordered list with *", () => {
  const out = render("* a\n* b");
  assert.ok(/<ul>/.test(out));
  assert.ok(out.includes("<li>a</li>"));
});

test("unordered list with +", () => {
  const out = render("+ a\n+ b");
  assert.ok(/<ul>/.test(out));
});

test("nested unordered list (one level)", () => {
  const out = render("- a\n  - a1\n  - a2\n- b");
  assert.ok(/<li>a<ul>/.test(out), "expected nested ul inside li: " + out);
  assert.ok(out.includes("<li>a1</li>"));
  assert.ok(out.includes("<li>a2</li>"));
  assert.ok(out.includes("<li>b</li>"));
});

// --------------------- ordered lists ---------------------

test("simple ordered list", () => {
  const out = render("1. a\n2. b");
  assert.ok(/<ol>/.test(out));
  assert.ok(out.includes("<li>a</li>"));
  assert.ok(out.includes("<li>b</li>"));
});

test("nested ordered list", () => {
  const out = render("1. a\n  1. a1\n  2. a2\n2. b");
  assert.ok(out.includes("<li>a"));
  assert.ok(out.includes("<li>a1</li>"));
  assert.ok(out.includes("<li>a2</li>"));
  assert.ok(out.includes("<li>b</li>"));
});

// --------------------- XSS hardening ---------------------

test("XSS: raw script tag in body of markdown does not execute (no live tag)", () => {
  const out = render("Hello\n\n<script>window.x=1</script>");
  assert.ok(!/<script>/i.test(out), out);
});

test("XSS: img onerror payload neutralized", () => {
  const out = render('<img src=x onerror="alert(1)">');
  assert.ok(!/<img\b/i.test(out), out);
  assert.ok(!/onerror=/i.test(out.replace(/&[a-z#0-9]+;/gi, "")) || out.includes("&quot;"));
});

test("XSS: javascript: link is neutralized", () => {
  const out = render("[a](javascript:alert(1))");
  assert.ok(!/href="javascript:/i.test(out), out);
});

test("XSS: raw HTML attribute injection is escaped", () => {
  const out = render("<a href=\"javascript:alert(1)\">click</a>");
  // raw HTML is not pass-through; should be escaped
  assert.ok(!/<a\s+href="javascript:/i.test(out), out);
});

// --------------------- integration ---------------------

test("integration: mixed document", () => {
  const md = [
    "# Title",
    "",
    "A paragraph with **bold** and *italic* and `code`.",
    "",
    "> A quote with [link](https://example.com).",
    "",
    "- item 1",
    "- item 2",
    "  - nested",
    "",
    "```js",
    "var x = 1;",
    "```",
    "",
  ].join("\n");
  const out = render(md);
  assert.ok(out.includes("<h1>Title</h1>"));
  assert.ok(/<strong>bold<\/strong>/.test(out));
  assert.ok(/<em>italic<\/em>/.test(out));
  assert.ok(/<code>code<\/code>/.test(out));
  assert.ok(/<blockquote>/.test(out));
  assert.ok(/<a href="https:\/\/example\.com">link<\/a>/.test(out));
  assert.ok(/<ul>/.test(out));
  assert.ok(/<li>nested<\/li>/.test(out));
  assert.ok(/<pre><code class="language-js">/.test(out));
});
