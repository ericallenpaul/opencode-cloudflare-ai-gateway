// @ts-check
/**
 * markdown-editor.spec.js  --  R1-R10 deterministic judge for the markdown-editor benchmark.
 *
 * Environment variables (set by judge-run.ps1):
 *   MARKDOWN_HTML              absolute path to the markdown.html under test
 *   MARKDOWN_TOOL_NAME         tool name, e.g. "claude", "codex", "opencode"
 *   MARKDOWN_TESTS             (optional) absolute path to the tool's *.test.js
 *   JUDGE_OUTPUT_JSON          absolute path for the output JSON file
 *   PLAYWRIGHT_SCREENSHOTS_DIR absolute path for screenshots dir (created before this runs)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const HTML_PATH       = process.env.MARKDOWN_HTML          || '';
const TOOL_NAME       = process.env.MARKDOWN_TOOL_NAME     || 'unknown';
const OUTPUT_JSON     = process.env.JUDGE_OUTPUT_JSON      || '';
const SCREENSHOTS_DIR = process.env.PLAYWRIGHT_SCREENSHOTS_DIR || '';

if (!HTML_PATH)   throw new Error('MARKDOWN_HTML env var is required');
if (!OUTPUT_JSON) throw new Error('JUDGE_OUTPUT_JSON env var is required');

const FILE_URL = 'file:///' + HTML_PATH.replace(/\\/g, '/');

function screenshotPath(name) {
  if (SCREENSHOTS_DIR) return path.join(SCREENSHOTS_DIR, name);
  return path.join(path.dirname(OUTPUT_JSON), name);
}

// ---------------------------------------------------------------------------
// Result accumulator
// ---------------------------------------------------------------------------

/** @type {{ tool: string; htmlPath: string; results: Record<string,{status:string;reason:string}>; consoleErrors: string[]; jsErrors: string[]; screenshots: string[] }} */
const judgeOutput = {
  tool:          TOOL_NAME,
  htmlPath:      HTML_PATH,
  results:       {},
  consoleErrors: [],
  jsErrors:      [],
  screenshots:   [],
};

function record(criterion, status, reason) {
  judgeOutput.results[criterion] = { status, reason };
}

function addScreenshot(name) {
  judgeOutput.screenshots.push(name);
}

// ---------------------------------------------------------------------------
// Test corpus -- hardcoded strings, one per R3-R9 scenario
// ---------------------------------------------------------------------------

const CORPUS = {
  headings:        '# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4\n##### Heading 5\n###### Heading 6',
  emphasis:        '**bold text**\n\n*italic text*\n\n_also italic_\n\n***bold italic***',
  lists_unordered: '- item one\n- item two\n  - nested item\n  - another nested\n- item three',
  lists_ordered:   '1. first\n2. second\n3. third',
  code_inline:     'Use `const x = 1` for declarations.',
  code_fence:      '```\nfunction hello() {\n  return "world";\n}\n```',
  link:            '[Example](https://example.com)',
  blockquote:      '> first line\n> second line\n> third line',
  xss_script:      '<script>window.__xssFired = true; alert("xss")</script>',
  xss_img:         '<img src=x onerror="window.__xssFired = true; alert(1)">',
  xss_link:        '[click me](javascript:window.__xssFired=true;alert(2))',
  large_input:     ('# Performance test\n\nLorem ipsum.\n\n').repeat(500),
};

// ---------------------------------------------------------------------------
// Selector-agnostic helpers
// ---------------------------------------------------------------------------

/**
 * Returns the markdown input element (textarea or contenteditable).
 * Priority: textarea, [role="textbox"], [contenteditable="true"]
 */
async function getEditor(page) {
  const textarea = page.locator('textarea').first();
  if (await textarea.count() > 0) return textarea;

  const textbox = page.locator('[role="textbox"]').first();
  if (await textbox.count() > 0) return textbox;

  return page.locator('[contenteditable="true"]').first();
}

/**
 * Returns the preview pane locator.
 * Priority: .preview, #preview, [data-preview], then the non-editor pane heuristic.
 * The heuristic: find a div/section/article/aside that is NOT the editor's container
 * and contains rendered HTML (has at least one block-level child element).
 */
async function getPreview(page) {
  const byClass = page.locator('.preview').first();
  if (await byClass.count() > 0) return byClass;

  const byId = page.locator('#preview').first();
  if (await byId.count() > 0) return byId;

  const byAttr = page.locator('[data-preview]').first();
  if (await byAttr.count() > 0) return byAttr;

  // Heuristic: the preview is a sibling of (or nearby) the textarea container.
  // Find a div/section/article that is NOT and does NOT contain the textarea.
  const editor = await getEditor(page);
  const editorHandle = await editor.elementHandle();

  const candidates = page.locator('div, section, article, aside, main');
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const el = candidates.nth(i);
    // Skip if this element contains the editor
    if (editorHandle) {
      const containsEditor = await el.evaluate(
        (node, editorNode) => node.contains(editorNode),
        editorHandle
      );
      if (containsEditor) continue;
    }
    // Must have some inner HTML content (not purely a layout wrapper with nothing)
    const innerHTML = await el.evaluate(node => node.innerHTML.trim());
    if (innerHTML.length > 0) return el;
  }

  // Last resort: return the second major container on the page
  return page.locator('div').nth(1);
}

/**
 * Clears the editor, fills it with text, and waits for the live render.
 * Uses page.fill() which dispatches input events.
 * After fill, waits up to 500ms for the preview to update.
 */
async function setMarkdown(page, editor, text) {
  // page.fill clears and fills, dispatching input events
  await editor.fill(text);
  // Give the debounced renderer time to fire (spec says ~250ms; we allow 500ms)
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Helper: flush output JSON
// ---------------------------------------------------------------------------

function flushOutput() {
  if (!OUTPUT_JSON) return;
  try {
    let existing = {};
    if (fs.existsSync(OUTPUT_JSON)) {
      try { existing = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8')); } catch (_) {}
    }
    const merged = Object.assign({}, existing, judgeOutput, {
      results: Object.assign({}, existing.results || {}, judgeOutput.results),
    });
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(merged, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write judge output JSON:', err);
  }
}

// ---------------------------------------------------------------------------
// Shared error collection
// ---------------------------------------------------------------------------

let globalConsoleErrors = [];
let globalJsErrors = [];

test.beforeEach(async ({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      globalConsoleErrors.push(text);
      judgeOutput.consoleErrors.push(text);
    }
  });
  page.on('pageerror', err => {
    globalJsErrors.push(err.message);
    judgeOutput.jsErrors.push(err.message);
  });
});

test.afterAll(() => {
  flushOutput();
});

// ---------------------------------------------------------------------------
// R1 -- page loads, dual-pane layout visible, no console errors
// ---------------------------------------------------------------------------
test('R1 -- page loads, dual-pane layout visible, no console errors', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    const editorVisible  = await editor.count()  > 0 && await editor.isVisible();
    const previewVisible = await preview.count() > 0 && await preview.isVisible();

    const ssName = 'empty.png';
    await page.screenshot({ path: screenshotPath(ssName) });
    addScreenshot(ssName);

    const errsBefore = [...globalConsoleErrors];

    if (!editorVisible) {
      status = 'FAIL';
      reason = 'Editor pane not found or not visible';
    } else if (!previewVisible) {
      status = 'FAIL';
      reason = 'Preview pane not found or not visible';
    } else if (errsBefore.length > 0) {
      status = 'PARTIAL';
      reason = `Both panes rendered but ${errsBefore.length} console error(s) on load`;
    } else {
      status = 'PASS';
      reason = 'Editor and preview panes visible, no console errors on load';
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R1', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R2 -- preview updates live within ~250ms of typing
// ---------------------------------------------------------------------------
test('R2 -- preview updates within ~250ms of keystroke', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    // Clear and type a distinctive string, measuring time to preview update
    await editor.fill('');
    const before = await preview.innerHTML();

    const t0 = Date.now();
    // Type via keyboard so input/keyup events fire naturally
    await editor.focus();
    await page.keyboard.type('# Live Test');
    // Poll until preview changes or 500ms elapses
    let updated = false;
    let elapsed = 0;
    while (elapsed < 500) {
      await page.waitForTimeout(50);
      elapsed = Date.now() - t0;
      const after = await preview.innerHTML();
      if (after !== before) { updated = true; break; }
    }

    if (updated && elapsed <= 350) {
      status = 'PASS';
      reason = `Preview updated ${elapsed}ms after keystroke`;
    } else if (updated) {
      status = 'PARTIAL';
      reason = `Preview updated but took ${elapsed}ms (spec says ~250ms)`;
    } else {
      status = 'FAIL';
      reason = `Preview did not update within 500ms of typing`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R2', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R3 -- all 6 ATX heading levels render as h1-h6
// ---------------------------------------------------------------------------
test('R3 -- ATX headings h1 through h6', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    await setMarkdown(page, editor, CORPUS.headings);

    const ssName = 'headings.png';
    await page.screenshot({ path: screenshotPath(ssName) });
    addScreenshot(ssName);

    const found = [];
    const missing = [];
    for (let level = 1; level <= 6; level++) {
      const tag = `h${level}`;
      const count = await preview.locator(tag).count();
      if (count > 0) found.push(tag);
      else missing.push(tag);
    }

    if (missing.length === 0) {
      status = 'PASS';
      reason = 'All h1-h6 found in preview';
    } else if (found.length >= 3) {
      status = 'PARTIAL';
      reason = `Found ${found.join(', ')}; missing ${missing.join(', ')}`;
    } else {
      status = 'FAIL';
      reason = `Only found: ${found.join(', ') || 'none'}; missing: ${missing.join(', ')}`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R3', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R4 -- bold, italic, bold+italic
// ---------------------------------------------------------------------------
test('R4 -- bold, italic, and bold+italic emphasis', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    await setMarkdown(page, editor, CORPUS.emphasis);

    const strongCount = await preview.locator('strong, b').count();
    const emCount     = await preview.locator('em, i').count();

    // Bold+italic: strong > em OR em > strong OR b > i OR i > b
    const nestedCount = await preview.locator(
      'strong em, em strong, strong i, i strong, b em, em b, b i, i b'
    ).count();

    const issues = [];
    if (strongCount === 0) issues.push('no <strong>/<b> found');
    if (emCount === 0)     issues.push('no <em>/<i> found');
    if (nestedCount === 0) issues.push('no nested bold+italic found');

    if (issues.length === 0) {
      status = 'PASS';
      reason = `strong=${strongCount}, em=${emCount}, nested bold+italic=${nestedCount}`;
    } else if (issues.length === 1 && nestedCount === 0 && strongCount > 0 && emCount > 0) {
      status = 'PARTIAL';
      reason = `Bold and italic present but bold+italic nesting missing`;
    } else {
      status = 'FAIL';
      reason = issues.join('; ');
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R4', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R5 -- unordered and ordered lists with nesting
// ---------------------------------------------------------------------------
test('R5 -- unordered list with nesting and ordered list', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    // Test unordered with nesting first
    await setMarkdown(page, editor, CORPUS.lists_unordered);

    const ulCount     = await preview.locator('ul').count();
    const nestedUl    = await preview.locator('ul ul, ul > li > ul').count();

    // Test ordered list
    await setMarkdown(page, editor, CORPUS.lists_ordered);
    const olCount = await preview.locator('ol').count();
    const liCount = await preview.locator('ol > li').count();

    const issues = [];
    if (ulCount === 0)  issues.push('no <ul> found');
    if (nestedUl === 0) issues.push('no nested <ul> found');
    if (olCount === 0)  issues.push('no <ol> found');
    if (liCount < 3)    issues.push(`<ol> has ${liCount} <li> items (expected 3)`);

    if (issues.length === 0) {
      status = 'PASS';
      reason = `ul present, nested ul present, ol with ${liCount} li`;
    } else if (issues.length <= 1 && nestedUl === 0) {
      status = 'PARTIAL';
      reason = `Basic lists work but nesting missing: ${issues.join('; ')}`;
    } else {
      status = 'FAIL';
      reason = issues.join('; ');
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R5', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R6 -- inline code and fenced code blocks
// ---------------------------------------------------------------------------
test('R6 -- inline code and fenced code blocks', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    // Inline code
    await setMarkdown(page, editor, CORPUS.code_inline);
    const inlineCodeCount = await preview.locator('code').count();

    // Fenced code block
    await setMarkdown(page, editor, CORPUS.code_fence);
    const preCount  = await preview.locator('pre').count();
    const preCode   = await preview.locator('pre code').count();

    const issues = [];
    if (inlineCodeCount === 0) issues.push('inline <code> not found');
    if (preCount === 0)        issues.push('<pre> not found for fenced block');
    if (preCode === 0)         issues.push('<pre><code> not found for fenced block');

    if (issues.length === 0) {
      status = 'PASS';
      reason = `Inline code and fenced pre>code both rendered`;
    } else if (inlineCodeCount > 0 && preCount > 0) {
      status = 'PARTIAL';
      reason = `Code present but nesting wrong: ${issues.join('; ')}`;
    } else {
      status = 'FAIL';
      reason = issues.join('; ');
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R6', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R7 -- inline links render as <a href="url">
// ---------------------------------------------------------------------------
test('R7 -- inline links render with correct href', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    await setMarkdown(page, editor, CORPUS.link);

    const anchorCount = await preview.locator('a').count();
    let hrefValue = '';
    let linkText  = '';
    if (anchorCount > 0) {
      hrefValue = (await preview.locator('a').first().getAttribute('href') || '').trim();
      linkText  = (await preview.locator('a').first().textContent() || '').trim();
    }

    const hrefCorrect = hrefValue === 'https://example.com';
    const textCorrect = linkText  === 'Example';

    if (anchorCount > 0 && hrefCorrect && textCorrect) {
      status = 'PASS';
      reason = `<a href="${hrefValue}">${linkText}</a> rendered correctly`;
    } else if (anchorCount > 0 && hrefCorrect) {
      status = 'PARTIAL';
      reason = `href correct but link text "${linkText}" (expected "Example")`;
    } else if (anchorCount > 0) {
      status = 'PARTIAL';
      reason = `<a> present but href="${hrefValue}" (expected "https://example.com")`;
    } else {
      status = 'FAIL';
      reason = 'No <a> element found in preview';
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R7', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R8 -- blockquotes render as <blockquote> for multi-line consecutive quotes
// ---------------------------------------------------------------------------
test('R8 -- blockquotes render as <blockquote>', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor  = await getEditor(page);
    const preview = await getPreview(page);

    await setMarkdown(page, editor, CORPUS.blockquote);

    const bqCount = await preview.locator('blockquote').count();
    let bqText = '';
    if (bqCount > 0) {
      bqText = (await preview.locator('blockquote').first().textContent() || '').trim();
    }

    // All three lines should appear somewhere in the blockquote text
    const hasFirst  = bqText.includes('first line');
    const hasSecond = bqText.includes('second line');
    const hasThird  = bqText.includes('third line');

    if (bqCount > 0 && hasFirst && hasSecond && hasThird) {
      status = 'PASS';
      reason = `<blockquote> found with all three lines`;
    } else if (bqCount > 0) {
      const missing = [
        !hasFirst  && '"first line"',
        !hasSecond && '"second line"',
        !hasThird  && '"third line"',
      ].filter(Boolean).join(', ');
      status = 'PARTIAL';
      reason = `<blockquote> present but missing content: ${missing}`;
    } else {
      status = 'FAIL';
      reason = 'No <blockquote> element found in preview';
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R8', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R9 -- XSS safety: script, img onerror, javascript: link
// ---------------------------------------------------------------------------
test('R9 -- XSS safety', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  const xssVectors = [
    { name: 'script tag',  input: CORPUS.xss_script },
    { name: 'img onerror', input: CORPUS.xss_img    },
    { name: 'js: link',    input: CORPUS.xss_link   },
  ];
  const failures = [];

  try {
    const ssName = 'xss-attempt.png';

    for (const vector of xssVectors) {
      await page.goto(FILE_URL);
      await page.waitForLoadState('domcontentloaded');

      // Install dialog handler BEFORE typing so alert() doesn't hang
      let dialogFired = false;
      page.once('dialog', async dialog => {
        dialogFired = true;
        try {
          await dialog.dismiss();
        } catch (_) {
          // Some browser/tool combinations auto-handle dialogs. The important
          // signal for this judge is that a dialog fired at all.
        }
      });

      // Also reset the XSS sentinel
      await page.evaluate(() => { window.__xssFired = false; });

      const editor  = await getEditor(page);
      const preview = await getPreview(page);

      await setMarkdown(page, editor, vector.input);

      // Take screenshot on first XSS vector only
      if (vector.name === 'script tag') {
        await page.screenshot({ path: screenshotPath(ssName) });
        addScreenshot(ssName);
      }

      // Check sentinel
      const xssFiredInPage = await page.evaluate(() => Boolean(window.__xssFired));
      if (xssFiredInPage) {
        failures.push(`${vector.name}: window.__xssFired=true (code executed)`);
      }

      if (dialogFired) {
        failures.push(`${vector.name}: alert() fired`);
      }

      // Check for script tags in preview DOM
      const scriptCount = await preview.locator('script').count();
      if (scriptCount > 0) {
        failures.push(`${vector.name}: ${scriptCount} <script> element(s) in preview DOM`);
      }

      // Check for iframe/embed/object
      const dangerousCount = await preview.locator('iframe, embed, object').count();
      if (dangerousCount > 0) {
        failures.push(`${vector.name}: ${dangerousCount} dangerous embedding element(s) in preview`);
      }

      // For javascript: link vector -- no href must start with javascript:
      if (vector.name === 'js: link') {
        const jsLinks = await preview.locator('a').evaluateAll(els =>
          els.filter(a => (a.getAttribute('href') || '').toLowerCase().startsWith('javascript:')).length
        );
        if (jsLinks > 0) {
          failures.push(`js: link: ${jsLinks} anchor(s) with href starting with "javascript:"`);
        }
      }
    }

    if (failures.length === 0) {
      status = 'PASS';
      reason = 'All XSS vectors blocked: no script execution, no alert, no javascript: href';
    } else if (failures.length <= 1) {
      status = 'PARTIAL';
      reason = `One XSS gap: ${failures.join('; ')}`;
    } else {
      status = 'FAIL';
      reason = failures.join('; ');
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R9', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R10 -- deferred to orchestrator; record placeholder here
// ---------------------------------------------------------------------------
test('R10 -- all tests pass (placeholder; orchestrator resolves)', async () => {
  record('R10', 'DEFERRED', 'Resolved by judge-run.ps1 via node --test exit code');
  expect(true).toBe(true);
});

// ---------------------------------------------------------------------------
// Large input -- performance smoke test (bonus, not scored)
// ---------------------------------------------------------------------------
test('large input -- 500-repeat paste does not hang', async ({ page }) => {
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const editor = await getEditor(page);
    const t0 = Date.now();
    await editor.fill(CORPUS.large_input);
    await page.waitForTimeout(1000); // give renderer time
    const elapsed = Date.now() - t0;

    // Not a hard failure -- just log
    record('R_PERF', elapsed < 3000 ? 'PASS' : 'PARTIAL',
      `Large input (${CORPUS.large_input.length} chars) processed in ${elapsed}ms`);
  } catch (err) {
    record('R_PERF', 'FAIL', `Exception: ${err.message}`);
  }
  expect(true).toBe(true);
});

// ---------------------------------------------------------------------------
// Mobile screenshot (bonus capture)
// ---------------------------------------------------------------------------
test('capture mobile screenshot', async ({ page }) => {
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');
    const ssName = 'mobile.png';
    await page.screenshot({ path: screenshotPath(ssName) });
    addScreenshot(ssName);
  } catch (_) {
    // Non-blocking
  }
  expect(true).toBe(true);
});
