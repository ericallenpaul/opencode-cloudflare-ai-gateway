# Tic-Tac-Toe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained tic-tac-toe game as a single HTML file with two-player local play, win/draw detection with winning line highlight, restart, localStorage-persisted scores, and Node-built-in-test-runner unit tests for the win/draw logic.

**Architecture:** Single `tictactoe.html` with inline CSS and JS. Game state lives in a `state` object (board, currentPlayer, winner, winningLine, scores). Pure functions for win/draw detection are exposed on `window` AND exported via CommonJS when running under Node, so the same source file is tested. Tests live in `tictactoe.test.js` using Node's built-in `node:test` runner (no install needed).

**Tech Stack:** HTML5, vanilla JavaScript, inline CSS, `localStorage`, Node.js built-in `node:test` + `node:assert`.

---

## File Structure

- `tictactoe.html` — game UI + inline CSS + inline JS (game logic functions + DOM wiring)
- `tictactoe.logic.js` — pure win/draw detection extracted as CommonJS module (kept identical to inline logic; sourced via small extraction script OR duplicated by hand and kept in lockstep). **Decision:** Keep logic functions as a separate `.js` file referenced by neither HTML nor build, and **inline the same source into the HTML**. To keep DRY without a build step, the HTML loads the file's text via `<script>` injection at load time using a `<script>` tag pointed at the same file. BUT — since the file must run from `file://` URL by double-clicking with no external dependencies, we instead **duplicate the small set of pure functions into both files** and rely on the test suite to verify the duplicated implementation. Acceptable because the logic is tiny (~30 lines) and the tests directly import from the standalone module.
- `tictactoe.test.js` — Node built-in test runner tests for win/draw detection
- `README.md` — open instructions, test command, scope notes

**Note on duplication:** The user requirement "no external dependencies" + "open from file:// by double-clicking" rules out ES module imports across files (browsers block `file://` module loads in most setups). The cleanest path: write logic functions once in `tictactoe.logic.js` (CommonJS), and **inline the exact same function source into the `<script>` block of `tictactoe.html`** — the test file requires the .js module. We accept the duplication; the tests will catch drift if the inline copy diverges from the module copy because we'll add a smoke test that reads the HTML and asserts the function signatures match.

Actually — simpler: tests only need to verify the logic module. We inline the same logic into the HTML by hand. If the user runs tests and they pass, the module is correct. The HTML's inline copy is a deliberate copy that we verify visually once. We will NOT add a drift-detection test (YAGNI for a benchmark deliverable).

---

### Task 1: Project skeleton + first failing test

**Files:**
- Create: `tictactoe.logic.js`
- Create: `tictactoe.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tictactoe.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkWinner } = require('./tictactoe.logic.js');

test('checkWinner returns null for an empty board', () => {
  const board = [null, null, null, null, null, null, null, null, null];
  assert.deepEqual(checkWinner(board), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tictactoe.test.js`
Expected: FAIL with "Cannot find module './tictactoe.logic.js'"

- [ ] **Step 3: Write minimal implementation**

```javascript
// tictactoe.logic.js
function checkWinner(board) {
  return null;
}
module.exports = { checkWinner };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tictactoe.test.js`
Expected: PASS — 1 test passes.

---

### Task 2: Win detection — rows

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.logic.js`

- [ ] **Step 1: Add failing tests for row wins**

```javascript
test('checkWinner detects X winning top row', () => {
  const board = ['X','X','X', null,null,null, null,null,null];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [0,1,2] });
});

test('checkWinner detects O winning middle row', () => {
  const board = [null,null,null, 'O','O','O', null,null,null];
  assert.deepEqual(checkWinner(board), { winner: 'O', line: [3,4,5] });
});

test('checkWinner detects X winning bottom row', () => {
  const board = [null,null,null, null,null,null, 'X','X','X'];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [6,7,8] });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 3 tests FAIL (returning null instead of objects).

- [ ] **Step 3: Implement row detection**

```javascript
const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
];
function checkWinner(board) {
  for (const line of WINNING_LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}
module.exports = { checkWinner };
```

- [ ] **Step 4: Run tests — all pass**

Run: `node --test tictactoe.test.js`
Expected: 4 tests pass.

---

### Task 3: Win detection — columns and diagonals

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.logic.js`

- [ ] **Step 1: Add failing tests for columns and diagonals**

```javascript
test('checkWinner detects column win (left)', () => {
  const board = ['X',null,null, 'X',null,null, 'X',null,null];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [0,3,6] });
});

test('checkWinner detects column win (middle)', () => {
  const board = [null,'O',null, null,'O',null, null,'O',null];
  assert.deepEqual(checkWinner(board), { winner: 'O', line: [1,4,7] });
});

test('checkWinner detects column win (right)', () => {
  const board = [null,null,'X', null,null,'X', null,null,'X'];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [2,5,8] });
});

test('checkWinner detects diagonal win (top-left to bottom-right)', () => {
  const board = ['X',null,null, null,'X',null, null,null,'X'];
  assert.deepEqual(checkWinner(board), { winner: 'X', line: [0,4,8] });
});

test('checkWinner detects diagonal win (top-right to bottom-left)', () => {
  const board = [null,null,'O', null,'O',null, 'O',null,null];
  assert.deepEqual(checkWinner(board), { winner: 'O', line: [2,4,6] });
});
```

- [ ] **Step 2: Run — fail**

Run: `node --test tictactoe.test.js`
Expected: 5 new tests fail.

- [ ] **Step 3: Add columns + diagonals to `WINNING_LINES`**

```javascript
const WINNING_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];
```

- [ ] **Step 4: Run — all pass**

Run: `node --test tictactoe.test.js`
Expected: 9 tests pass.

---

### Task 4: Draw detection

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.logic.js`

- [ ] **Step 1: Add failing tests**

```javascript
const { checkWinner, getGameStatus } = require('./tictactoe.logic.js');

test('getGameStatus returns in_progress for empty board', () => {
  const board = [null,null,null,null,null,null,null,null,null];
  assert.deepEqual(getGameStatus(board), { status: 'in_progress', winner: null, line: null });
});

test('getGameStatus returns won when a player wins', () => {
  const board = ['X','X','X', null,null,null, null,null,null];
  assert.deepEqual(getGameStatus(board), { status: 'won', winner: 'X', line: [0,1,2] });
});

test('getGameStatus returns draw when board full with no winner', () => {
  const board = ['X','O','X', 'X','O','O', 'O','X','X'];
  assert.deepEqual(getGameStatus(board), { status: 'draw', winner: null, line: null });
});

test('getGameStatus returns in_progress when board partial with no winner', () => {
  const board = ['X','O',null, null,null,null, null,null,null];
  assert.deepEqual(getGameStatus(board), { status: 'in_progress', winner: null, line: null });
});
```

- [ ] **Step 2: Run — fail**

Run: `node --test tictactoe.test.js`
Expected: `getGameStatus is not a function` failures.

- [ ] **Step 3: Implement `getGameStatus`**

```javascript
function getGameStatus(board) {
  const result = checkWinner(board);
  if (result) return { status: 'won', winner: result.winner, line: result.line };
  if (board.every(cell => cell !== null)) return { status: 'draw', winner: null, line: null };
  return { status: 'in_progress', winner: null, line: null };
}
module.exports = { checkWinner, getGameStatus };
```

- [ ] **Step 4: Run — all pass**

Run: `node --test tictactoe.test.js`
Expected: 13 tests pass.

---

### Task 5: Edge cases — first-win-wins, invalid boards

**Files:**
- Modify: `tictactoe.test.js`

- [ ] **Step 1: Add edge-case tests**

```javascript
test('checkWinner does not falsely match all-null line', () => {
  // Three nulls in a row should not be a win
  const board = [null,null,null, 'X','O','X', 'O','X','O'];
  assert.equal(checkWinner(board), null);
});

test('checkWinner returns the first detected winning line if multiple exist', () => {
  // Pathological/impossible board with two winning lines: ensure deterministic
  const board = ['X','X','X', 'X','X','X', null,null,null];
  const result = checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.ok(Array.isArray(result.line));
  assert.equal(result.line.length, 3);
});

test('getGameStatus prefers won over draw when both could match (full winning board)', () => {
  // X wins on top row, board is full
  const board = ['X','X','X', 'O','O','X', 'O','X','O'];
  const result = getGameStatus(board);
  assert.equal(result.status, 'won');
  assert.equal(result.winner, 'X');
});
```

- [ ] **Step 2: Run — should pass already with current implementation**

Run: `node --test tictactoe.test.js`
Expected: 16 tests pass. (If the all-null test fails, it means the first guard `board[a] &&` is missing — fix.)

---

### Task 6: Build the HTML game

**Files:**
- Create: `tictactoe.html`

- [ ] **Step 1: Write the full HTML file**

Create `tictactoe.html` with:
- `<style>` block: 3x3 grid using CSS grid, large cells, hover effect, winning-cell highlight class (e.g., `background: #ffe066`)
- `<body>` with: H1 title, status text, 9 cell buttons, restart button, scoreboard div (X/O/Draws)
- `<script>` block with:
  - Inlined copy of `checkWinner`, `getGameStatus`, `WINNING_LINES` (identical to `tictactoe.logic.js`)
  - State: `{ board: Array(9).fill(null), currentPlayer: 'X', gameOver: false, scores: {X:0,O:0,draws:0} }`
  - On load: read scores from `localStorage.getItem('ttt-scores')`, parse, merge into state, render
  - Cell click handler: ignore if `gameOver` or cell occupied; set cell to currentPlayer; call `getGameStatus`; if won → highlight winning line, increment winner score, save, set gameOver, update status text; if draw → increment draws, save, set gameOver, update status; else swap currentPlayer; render
  - Restart button: reset board, currentPlayer='X', gameOver=false, clear winning highlight; render (does NOT reset scores)
  - Render: paint cells with X/O, set status text, paint scoreboard
  - Save: `localStorage.setItem('ttt-scores', JSON.stringify(state.scores))`

- [ ] **Step 2: Open the HTML in a browser**

Open `tictactoe.html` by double-clicking (file://). Confirm:
- Empty 3x3 grid renders
- Click cell → X appears, next click → O appears, alternating
- Three in a row → cells highlight, status announces winner, score increments
- Refresh page → score persists
- Restart button clears board but keeps score
- Draw scenario → "Draw" status, draw count increments

---

### Task 7: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Content:
- "Open `tictactoe.html` by double-clicking; it runs from `file://`"
- "Run tests: `node --test tictactoe.test.js`"
- Scope IN: two-player local, win/draw detection with highlight, restart, localStorage scoreboard, Node built-in tests for win/draw logic
- Scope OUT: AI opponent, network play, score reset button (not requested), accessibility audit, mobile-specific styling beyond basic responsiveness
- Known limitations: inline logic in HTML is a hand-mirrored copy of `tictactoe.logic.js` (no build step allowed)

---

## Self-Review

**Spec coverage:**
- Two-player local play → Task 6
- Visual win/draw with winning line highlight → Task 6 + Tasks 1-5 logic
- Restart button → Task 6
- Persistent score tracker (localStorage) → Task 6
- Inline CSS+JS, no externals, no build → Task 6 (design constraint enforced)
- Runs from file:// → Task 6 step 2 verifies
- Unit tests for win/draw, single command, built-in Node → Tasks 1-5, `node --test tictactoe.test.js`
- Deliverables: HTML file, test file, README → Tasks 6, 1-5, 7

**Placeholder scan:** None — all code blocks contain real code.

**Type consistency:** `checkWinner` returns `{ winner, line } | null`. `getGameStatus` returns `{ status, winner, line }`. Consistent across Tasks 2-6.

Plan is complete. Proceeding directly to TDD execution per user instruction.
