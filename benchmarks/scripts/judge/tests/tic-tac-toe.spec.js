// @ts-check
/**
 * tictactoe.spec.js  --  R1-R10 deterministic judge for the tic-tac-toe benchmark.
 *
 * Environment variables (set by judge-run.ps1):
 *   TICTACTOE_HTML         absolute path to the tictactoe.html under test
 *   TICTACTOE_TOOL_NAME    tool name, e.g. "claude", "codex", "opencode"
 *   TICTACTOE_TESTS        (optional) absolute path to the tool's *.test.js
 *   JUDGE_OUTPUT_JSON      absolute path for the output JSON file
 *   PLAYWRIGHT_SCREENSHOTS_DIR  absolute path for screenshots dir (created before this runs)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const HTML_PATH      = process.env.TICTACTOE_HTML         || '';
const TOOL_NAME      = process.env.TICTACTOE_TOOL_NAME    || 'unknown';
const OUTPUT_JSON    = process.env.JUDGE_OUTPUT_JSON       || '';
const SCREENSHOTS_DIR = process.env.PLAYWRIGHT_SCREENSHOTS_DIR || '';

if (!HTML_PATH)    throw new Error('TICTACTOE_HTML env var is required');
if (!OUTPUT_JSON)  throw new Error('JUDGE_OUTPUT_JSON env var is required');

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
// Selector-agnostic helpers
// ---------------------------------------------------------------------------

/**
 * Returns the board container locator.
 * Priority: [role="grid"] > #board > .board > any container with exactly 9 clickable children.
 */
async function getBoard(page) {
  const candidates = [
    page.locator('[role="grid"]').first(),
    page.locator('#board').first(),
    page.locator('.board').first(),
  ];
  for (const loc of candidates) {
    if (await loc.count() > 0) return loc;
  }
  // Fallback: find a container whose direct children include exactly 9 clickable elements
  const allDivs = page.locator('div, section, main');
  const count = await allDivs.count();
  for (let i = 0; i < count; i++) {
    const el = allDivs.nth(i);
    const clickable = el.locator(':scope > button, :scope > div[role="gridcell"], :scope > div');
    const n = await clickable.count();
    if (n === 9) return el;
  }
  return candidates[0]; // last resort
}

/**
 * Returns array of 9 cell locators in row-major order.
 * Priority: [role="gridcell"] > [data-idx] > [data-index] > [data-cell-index] > direct children of board (first 9).
 */
async function getCells(page) {
  // [role="gridcell"] -- covers codex + opencode
  const gridcells = page.locator('[role="gridcell"]');
  if (await gridcells.count() >= 9) {
    return Array.from({ length: 9 }, (_, i) => gridcells.nth(i));
  }

  // [data-idx="0"]..[data-idx="8"] -- opencode
  const byDataIdx = page.locator('[data-idx="0"]');
  if (await byDataIdx.count() > 0) {
    return Array.from({ length: 9 }, (_, i) => page.locator(`[data-idx="${i}"]`).first());
  }

  // [data-index="0"] -- claude
  const byDataIndex = page.locator('[data-index="0"]');
  if (await byDataIndex.count() > 0) {
    return Array.from({ length: 9 }, (_, i) => page.locator(`[data-index="${i}"]`).first());
  }

  // [data-cell-index="0"] -- codex
  const byCellIndex = page.locator('[data-cell-index="0"]');
  if (await byCellIndex.count() > 0) {
    return Array.from({ length: 9 }, (_, i) => page.locator(`[data-cell-index="${i}"]`).first());
  }

  // Direct children of board container
  const board = await getBoard(page);
  const children = board.locator(':scope > button, :scope > div, :scope > span');
  const childCount = await children.count();
  const take = Math.min(childCount, 9);
  return Array.from({ length: take }, (_, i) => children.nth(i));
}

/**
 * Returns the status/announcement element.
 * Priority: [role="status"] > [aria-live] > #status > .status > first element matching /turn|move|win|draw/i
 */
async function getStatus(page) {
  const candidates = [
    page.locator('[role="status"]').first(),
    page.locator('[aria-live]').first(),
    page.locator('#status').first(),
    page.locator('.status').first(),
  ];
  for (const loc of candidates) {
    if (await loc.count() > 0) return loc;
  }
  // Text-content fallback
  return page.locator('*').filter({ hasText: /X('s)? (to move|turn)|O('s)? (to move|turn)/i }).first();
}

/**
 * Returns the Restart button.
 */
async function getRestartButton(page) {
  return page
    .locator('button, [role="button"]')
    .filter({ hasText: /^restart$|^new game$/i })
    .first();
}

/**
 * Returns the Reset Scores button.
 */
async function getResetScoresButton(page) {
  return page
    .locator('button, [role="button"]')
    .filter({ hasText: /reset scores?|clear scores?/i })
    .first();
}

/**
 * Returns { x, o, draws } score locators where findable.
 * Priority: [data-score="X/O/draws"] > #scoreX/#scoreO/#scoreD > #score-x/#score-o/#score-draws
 */
async function getScoreElements(page) {
  // codex: data-score="X" / data-score="O" / data-score="draws"
  if (await page.locator('[data-score="X"]').count() > 0) {
    return {
      x:     page.locator('[data-score="X"]').first(),
      o:     page.locator('[data-score="O"]').first(),
      draws: page.locator('[data-score="draws"]').first(),
    };
  }
  // opencode: #scoreX, #scoreO, #scoreD
  if (await page.locator('#scoreX').count() > 0) {
    return {
      x:     page.locator('#scoreX').first(),
      o:     page.locator('#scoreO').first(),
      draws: page.locator('#scoreD').first(),
    };
  }
  // claude: #score-x, #score-o, #score-draws
  if (await page.locator('#score-x').count() > 0) {
    return {
      x:     page.locator('#score-x').first(),
      o:     page.locator('#score-o').first(),
      draws: page.locator('#score-draws').first(),
    };
  }
  // Generic: find .value or .score elements near labels X/O/draws
  return { x: null, o: null, draws: null };
}

// ---------------------------------------------------------------------------
// Helper: flush output JSON
// ---------------------------------------------------------------------------

function flushOutput() {
  if (!OUTPUT_JSON) return;
  try {
    // Merge with existing content if present (e.g. R9/R10 appended by orchestrator)
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
// Tests
// ---------------------------------------------------------------------------

// Shared console-error collection across all tests
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
// R1 -- page loads, 9 cells visible, no console errors
// ---------------------------------------------------------------------------
test('R1 -- page loads, 9 cells visible, no console errors', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const cells = await getCells(page);
    const visibleCount = cells.length;

    // Take empty board screenshot
    const ssName = 'empty.png';
    await page.screenshot({ path: screenshotPath(ssName) });
    addScreenshot(ssName);

    const errsBefore = [...globalConsoleErrors];

    if (visibleCount < 9) {
      status = 'FAIL';
      reason = `Only ${visibleCount} cells found (expected 9)`;
    } else if (errsBefore.length > 0) {
      status = 'PARTIAL';
      reason = `9 cells rendered but ${errsBefore.length} console error(s) on load`;
    } else {
      status = 'PASS';
      reason = '9 cells rendered, no console errors on load';
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R1', status, reason);
  // Always pass Playwright-level so all tests run
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R2 -- X and O alternate; clicking occupied cell does nothing
// ---------------------------------------------------------------------------
test('R2 -- X/O alternate, occupied cell blocked', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const cells = await getCells(page);
    const statusEl = await getStatus(page);

    const statusBefore = await statusEl.textContent();

    // Click cell 0 -- should be X
    await cells[0].click();
    const cell0Text = (await cells[0].textContent() || '').trim();

    // Status should change
    const statusAfterX = await statusEl.textContent();

    // Click cell 1 -- should be O
    await cells[1].click();
    const cell1Text = (await cells[1].textContent() || '').trim();

    // Click cell 2 -- should be X
    await cells[2].click();
    const cell2Text = (await cells[2].textContent() || '').trim();

    // Try clicking cell 0 again (occupied) -- text should not change.
    // Some tools defend by adding the `disabled` attribute to occupied cells
    // (claude, codex). That is itself proof that the occupied-cell is blocked.
    // Other tools leave the button enabled but the handler ignores the click
    // (opencode). Handle both: short attempt with force, then verify content
    // hasn't changed.
    const cell0DisabledBeforeReclick = await cells[0].isDisabled();
    let cell0TextAfterReclick = cell0Text;
    if (!cell0DisabledBeforeReclick) {
      try {
        await cells[0].click({ force: true, timeout: 2000 });
      } catch { /* ignore click failure -- we measure by content not throw */ }
      cell0TextAfterReclick = (await cells[0].textContent() || '').trim();
    }

    // Status after first X move should differ from initial
    const statusChanged = statusAfterX !== statusBefore;

    const xPlaced = /X/i.test(cell0Text);
    const oPlaced = /O/i.test(cell1Text);
    const x2Placed = /X/i.test(cell2Text);
    const occupiedBlocked = cell0TextAfterReclick === cell0Text;

    const mid = screenshotPath('mid-game.png');
    await page.screenshot({ path: mid });
    addScreenshot('mid-game.png');

    if (xPlaced && oPlaced && x2Placed && occupiedBlocked && statusChanged) {
      status = 'PASS';
      reason = 'X placed first, O second, X third; occupied cell blocked; status updates';
    } else {
      const issues = [];
      if (!xPlaced) issues.push('X not placed in cell 0');
      if (!oPlaced) issues.push('O not placed in cell 1');
      if (!x2Placed) issues.push('X not placed in cell 2');
      if (!occupiedBlocked) issues.push('occupied cell was modified on reclick');
      if (!statusChanged) issues.push('status did not change after first move');
      status = 'PARTIAL';
      reason = issues.join('; ');
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R2', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R3 -- win detection: 3-in-a-row ends game, further clicks do nothing
// ---------------------------------------------------------------------------
test('R3 -- win detection, game ends, further clicks blocked', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const cells = await getCells(page);
    const statusEl = await getStatus(page);

    // X wins row 0: X=0, O=3, X=1, O=4, X=2
    await cells[0].click(); // X
    await cells[3].click(); // O
    await cells[1].click(); // X
    await cells[4].click(); // O
    await cells[2].click(); // X wins

    const winStatus = (await statusEl.textContent() || '').toLowerCase();
    const announcesWin = /x\s*(wins?|won)|winner.*x/i.test(winStatus);

    // Try clicking a remaining empty cell (cell 5) after game over.
    // Same defense pattern as R2: claude/codex disable all cells when the
    // game ends, opencode leaves them enabled and the handler ignores. Treat
    // both as blocked correctly.
    const cell5Before = (await cells[5].textContent() || '').trim();
    const cell5DisabledAfterWin = await cells[5].isDisabled();
    let cell5After = cell5Before;
    if (!cell5DisabledAfterWin) {
      try {
        await cells[5].click({ force: true, timeout: 2000 });
      } catch { /* ignore */ }
      cell5After = (await cells[5].textContent() || '').trim();
    }
    const furtherClickBlocked = cell5Before === cell5After;

    const ssName = 'win.png';
    await page.screenshot({ path: screenshotPath(ssName) });
    addScreenshot(ssName);

    if (announcesWin && furtherClickBlocked) {
      status = 'PASS';
      reason = 'X win announced in status, further clicks after win ignored';
    } else if (announcesWin) {
      status = 'PARTIAL';
      reason = 'X win announced but post-win clicks may not be fully blocked';
    } else if (furtherClickBlocked) {
      status = 'PARTIAL';
      reason = 'Post-win clicks blocked but win not announced in status text';
    } else {
      status = 'FAIL';
      reason = `Status after win: "${winStatus}"; furtherClickBlocked=${furtherClickBlocked}`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R3', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R4 -- draw detection: board fills with no winner, draw announced
// ---------------------------------------------------------------------------
test('R4 -- draw detection', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const cells = await getCells(page);
    const statusEl = await getStatus(page);

    // Known draw sequence (no three in a row):
    // X O X
    // X X O
    // O X O
    // Move order: X=0, O=1, X=2, O=4, X=3, O=5, X=7, O=6, X=8 -- actually check:
    // After: 0=X,1=O,2=X,3=X,4=O,5=O,6=O,7=X,8=X  -- row 0 X,O,X; row 1 X,O,O; row 2 O,X,X => no win
    await cells[0].click(); // X
    await cells[1].click(); // O
    await cells[2].click(); // X
    await cells[4].click(); // O (center)
    await cells[3].click(); // X
    await cells[5].click(); // O
    await cells[7].click(); // X
    await cells[6].click(); // O
    await cells[8].click(); // X -- board full

    const drawStatus = (await statusEl.textContent() || '').toLowerCase();
    const announcesDraw = /draw|tie/i.test(drawStatus);

    if (announcesDraw) {
      status = 'PASS';
      reason = 'Draw correctly detected and announced';
    } else {
      status = 'FAIL';
      reason = `Status after filled board: "${drawStatus}" (expected draw/tie announcement)`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R4', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R5 -- winning line visually highlighted (different CSS from non-winning cells)
// ---------------------------------------------------------------------------
test('R5 -- winning line visually highlighted', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const cells = await getCells(page);

    // Set up X win on row 0: X=0,1,2 with O on 3,4
    await cells[0].click(); // X
    await cells[3].click(); // O
    await cells[1].click(); // X
    await cells[4].click(); // O
    await cells[2].click(); // X wins

    await page.waitForTimeout(200); // allow animations

    const ssName = 'win-highlight.png';
    await page.screenshot({ path: screenshotPath(ssName) });
    addScreenshot(ssName);

    // Compare background-color of winning cell (0) vs non-winning (5)
    const winCellBg = await cells[0].evaluate(el => {
      const s = window.getComputedStyle(el);
      return s.backgroundColor || s.background;
    });
    const normalCellBg = await cells[5].evaluate(el => {
      const s = window.getComputedStyle(el);
      return s.backgroundColor || s.background;
    });

    // Also check for class name differences
    const winCellClass  = await cells[0].getAttribute('class') || '';
    const normalCellClass = await cells[5].getAttribute('class') || '';

    const bgDiffers    = winCellBg !== normalCellBg;
    const classDiffers = winCellClass !== normalCellClass;

    if (bgDiffers || classDiffers) {
      status = 'PASS';
      reason = bgDiffers
        ? `Winning cell bg (${winCellBg}) differs from non-winning (${normalCellBg})`
        : `Winning cell class "${winCellClass}" differs from non-winning "${normalCellClass}"`;
    } else {
      status = 'FAIL';
      reason = 'No detectable visual difference between winning and non-winning cells';
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R5', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R6 -- Restart resets board but preserves scores
// ---------------------------------------------------------------------------
test('R6 -- restart resets board, scores preserved', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const cells = await getCells(page);
    const scores = await getScoreElements(page);

    // Read scores before
    const scoreXBefore = scores.x ? (await scores.x.textContent() || '0').trim() : null;

    // Play X win
    await cells[0].click(); // X
    await cells[3].click(); // O
    await cells[1].click(); // X
    await cells[4].click(); // O
    await cells[2].click(); // X wins

    await page.waitForTimeout(100);

    // Read scores after win
    const scoreXAfterWin = scores.x ? (await scores.x.textContent() || '0').trim() : null;

    // Click restart
    const restartBtn = await getRestartButton(page);
    await restartBtn.click();
    await page.waitForTimeout(100);

    // Read scores after restart
    const scoreXAfterRestart = scores.x ? (await scores.x.textContent() || '0').trim() : null;

    // Verify board is empty
    const freshCells = await getCells(page);
    let allEmpty = true;
    for (const cell of freshCells) {
      const txt = (await cell.textContent() || '').trim();
      if (txt !== '') { allEmpty = false; break; }
    }

    const scoresPreserved = (scoreXAfterRestart !== null)
      ? scoreXAfterRestart === scoreXAfterWin
      : true; // can't read scores, assume preserved

    if (allEmpty && scoresPreserved) {
      status = 'PASS';
      reason = 'Board empty after restart; X score preserved';
    } else if (allEmpty) {
      status = 'PARTIAL';
      reason = 'Board empty after restart but scores may have reset';
    } else if (scoresPreserved) {
      status = 'PARTIAL';
      reason = 'Scores preserved but board not fully cleared after restart';
    } else {
      status = 'FAIL';
      reason = `allEmpty=${allEmpty} scoresPreserved=${scoresPreserved}`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R6', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R7 -- Scores increment on win and persist across page reload
// ---------------------------------------------------------------------------
test('R7 -- scores increment and persist across reload', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('domcontentloaded');

    const scores = await getScoreElements(page);

    const readX = async () => {
      const freshScores = await getScoreElements(page);
      if (!freshScores.x) return null;
      const txt = (await freshScores.x.textContent() || '0').trim();
      return parseInt(txt, 10) || 0;
    };

    const xBefore = await readX();

    // Play X win
    let cells = await getCells(page);
    await cells[0].click(); // X
    await cells[3].click(); // O
    await cells[1].click(); // X
    await cells[4].click(); // O
    await cells[2].click(); // X wins

    await page.waitForTimeout(100);
    const xAfterWin = await readX();

    // Reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(200);
    const xAfterReload = await readX();

    const scoreIncremented = (xBefore !== null && xAfterWin !== null) ? xAfterWin > xBefore : null;
    const scorePersisted   = (xAfterWin !== null && xAfterReload !== null) ? xAfterReload === xAfterWin : null;

    if (scoreIncremented === null) {
      status = 'PARTIAL';
      reason = 'Could not locate score elements to verify increment';
    } else if (scoreIncremented && scorePersisted) {
      status = 'PASS';
      reason = `X score: ${xBefore} -> ${xAfterWin} after win, ${xAfterReload} after reload (persisted)`;
    } else if (scoreIncremented && !scorePersisted) {
      status = 'PARTIAL';
      reason = `X score incremented (${xBefore}->${xAfterWin}) but did not persist across reload (got ${xAfterReload})`;
    } else {
      status = 'FAIL';
      reason = `X score before=${xBefore}, after win=${xAfterWin}, after reload=${xAfterReload}`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R7', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R8 -- No external scripts/resources, file:// works offline
// ---------------------------------------------------------------------------
test('R8 -- no external dependencies, file:// URL works', async ({ page }) => {
  let status = 'FAIL';
  let reason = '';
  const resourceFailures = [];

  page.on('requestfailed', req => {
    const url = req.url();
    if (!url.startsWith('file://')) {
      resourceFailures.push(url);
    }
  });

  try {
    await page.goto(FILE_URL);
    await page.waitForLoadState('networkidle');

    // Count external script tags (src not starting with data:)
    const externalScripts = await page
      .locator('script[src]')
      .filter({ hasNotText: '' })
      .evaluateAll(els =>
        els
          .map(el => el.getAttribute('src') || '')
          .filter(src => src && !src.startsWith('data:') && !src.startsWith('file://'))
      );

    const externalLinks = await page
      .locator('link[href]')
      .evaluateAll(els =>
        els
          .map(el => el.getAttribute('href') || '')
          .filter(h => h && /^https?:/.test(h))
      );

    const totalExternal = externalScripts.length + externalLinks.length;
    const loadConsoleErrors = [...globalConsoleErrors];

    if (totalExternal === 0 && resourceFailures.length === 0 && loadConsoleErrors.length === 0) {
      status = 'PASS';
      reason = 'No external scripts or links; no resource failures; no console errors';
    } else if (totalExternal > 0) {
      status = 'PARTIAL';
      reason = `${totalExternal} external resource(s) found: ${[...externalScripts, ...externalLinks].join(', ')}`;
    } else if (resourceFailures.length > 0) {
      status = 'FAIL';
      reason = `${resourceFailures.length} resource(s) failed to load: ${resourceFailures.join(', ')}`;
    } else {
      status = 'PARTIAL';
      reason = `${loadConsoleErrors.length} console error(s) on load but no external resources detected`;
    }
  } catch (err) {
    status = 'FAIL';
    reason = `Exception: ${err.message}`;
  }
  record('R8', status, reason);
  expect(status).not.toBe('__sentinel__');
});

// ---------------------------------------------------------------------------
// R9 / R10 -- deferred to orchestrator; record placeholder here
// ---------------------------------------------------------------------------
test('R9 -- test file exists (placeholder; orchestrator resolves)', async () => {
  record('R9', 'DEFERRED', 'Resolved by judge-run.ps1 via node --test');
  expect(true).toBe(true);
});

test('R10 -- all tests pass (placeholder; orchestrator resolves)', async () => {
  record('R10', 'DEFERRED', 'Resolved by judge-run.ps1 via node --test exit code');
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
