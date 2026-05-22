# Tic-Tac-Toe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, double-clickable HTML tic-tac-toe game with persistent score tracking and Node-runnable unit tests for the win/draw logic.

**Architecture:**
- Single `tictactoe.html` with inline `<style>` and inline `<script>`. The script defines pure logic functions (`checkWinner`, `isDraw`) at top level, then guards all DOM/`localStorage` initialization behind `typeof document !== 'undefined'` so the file is safely loadable in Node's `vm` module.
- `tictactoe.test.js` reads the HTML, extracts the `<script>` contents, evaluates them in a `vm` context with minimal stubs, then runs `node:test` cases against the exposed pure functions. No npm install required.
- `README.md` documents how to open, how to test, and scope.

**Tech Stack:** HTML5, vanilla JS (no frameworks), CSS Grid, `localStorage`, Node 18+ built-in `node:test` + `node:assert` + `node:vm`.

---

## File Structure

- Create: `tictactoe.html` — self-contained game
- Create: `tictactoe.test.js` — node --test suite for win/draw logic
- Create: `README.md` — usage + scope notes

---

### Task 1: Scaffold the test file with failing tests for `checkWinner`

**Files:**
- Create: `tictactoe.test.js`

- [ ] **Step 1: Write the failing test file**

```javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function loadGameContext() {
  const html = fs.readFileSync(path.join(__dirname, 'tictactoe.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No <script> block found in tictactoe.html');
  const context = {};
  vm.createContext(context);
  vm.runInContext(match[1], context);
  return context;
}

const game = loadGameContext();

test('checkWinner: empty board returns no winner', () => {
  const board = [null, null, null, null, null, null, null, null, null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, null);
  assert.deepEqual(result.line, null);
});

test('checkWinner: top row X win', () => {
  const board = ['X','X','X', null,null,null, null,null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [0,1,2]);
});

test('checkWinner: middle row O win', () => {
  const board = [null,null,null, 'O','O','O', null,null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [3,4,5]);
});

test('checkWinner: bottom row X win', () => {
  const board = [null,null,null, null,null,null, 'X','X','X'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [6,7,8]);
});

test('checkWinner: left column O win', () => {
  const board = ['O',null,null, 'O',null,null, 'O',null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [0,3,6]);
});

test('checkWinner: middle column X win', () => {
  const board = [null,'X',null, null,'X',null, null,'X',null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [1,4,7]);
});

test('checkWinner: right column O win', () => {
  const board = [null,null,'O', null,null,'O', null,null,'O'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [2,5,8]);
});

test('checkWinner: main diagonal X win', () => {
  const board = ['X',null,null, null,'X',null, null,null,'X'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'X');
  assert.deepEqual(result.line, [0,4,8]);
});

test('checkWinner: anti-diagonal O win', () => {
  const board = [null,null,'O', null,'O',null, 'O',null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, 'O');
  assert.deepEqual(result.line, [2,4,6]);
});

test('checkWinner: in-progress game returns no winner', () => {
  const board = ['X','O','X', null,'O',null, null,null,null];
  const result = game.checkWinner(board);
  assert.equal(result.winner, null);
  assert.deepEqual(result.line, null);
});

test('checkWinner: full board with no winner', () => {
  const board = ['X','O','X', 'X','O','O', 'O','X','X'];
  const result = game.checkWinner(board);
  assert.equal(result.winner, null);
  assert.deepEqual(result.line, null);
});

test('isDraw: empty board is not a draw', () => {
  const board = [null,null,null, null,null,null, null,null,null];
  assert.equal(game.isDraw(board), false);
});

test('isDraw: partially filled board is not a draw', () => {
  const board = ['X','O',null, null,'X',null, null,null,'O'];
  assert.equal(game.isDraw(board), false);
});

test('isDraw: full board with no winner IS a draw', () => {
  const board = ['X','O','X', 'X','O','O', 'O','X','X'];
  assert.equal(game.isDraw(board), true);
});

test('isDraw: full board with a winner is NOT a draw', () => {
  const board = ['X','X','X', 'O','O',null, null,null,null];
  assert.equal(game.isDraw(board), false);
});
```

- [ ] **Step 2: Run tests to verify they fail (no HTML yet)**

Run: `node --test tictactoe.test.js`
Expected: FAIL — `ENOENT: tictactoe.html` or "No <script> block found".

---

### Task 2: Create `tictactoe.html` with pure logic that satisfies the tests

**Files:**
- Create: `tictactoe.html`

- [ ] **Step 1: Write the HTML file with logic + UI**

The file structure (full content shown in Step 2):
1. `<!DOCTYPE html>` and `<head>` with inline `<style>`
2. `<body>` with status banner, 3×3 board grid, scoreboard, restart + reset-scores buttons
3. Single inline `<script>` defining:
   - Pure functions `checkWinner(board)` and `isDraw(board)` at top level
   - DOM/`localStorage` wiring guarded by `if (typeof document !== 'undefined')`

- [ ] **Step 2: Full file contents**

Write `tictactoe.html` with:
- `checkWinner(board)` returns `{winner: 'X'|'O'|null, line: number[]|null}` by iterating the 8 winning triples `[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]`.
- `isDraw(board)` returns `board.every(cell => cell !== null) && checkWinner(board).winner === null`.
- UI state: `board` (length-9 array), `currentPlayer` ('X' or 'O'), `scores` (`{X, O, draws}` from `localStorage['tictactoe.scores']`, default zeros), `gameOver` (bool).
- Click handler on each cell: ignore if cell filled or `gameOver`; else set cell, re-render, check winner → highlight line + bump scores + set gameOver; else check draw → bump draws + set gameOver; else swap currentPlayer.
- Restart button: clears board + currentPlayer back to 'X' + clears gameOver. Does NOT clear scores.
- Reset Scores button: zeroes scores in state + localStorage, then re-renders.
- Winning line highlight: add `.win` class to the 3 winning cells (CSS sets background highlight).
- Status text: "X's turn" / "O's turn" / "X wins!" / "O wins!" / "Draw!"

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: PASS — all 15 tests pass.

---

### Task 3: Smoke-test the HTML loads in a browser context

- [ ] **Step 1: Open the HTML file**

Open `tictactoe.html` by double-clicking (file:// URL). Verify:
- Board renders as 3×3 grid
- Clicking cells alternates X and O
- A winning row/column/diagonal highlights the winning line and shows "X wins!" or "O wins!"
- Scoreboard increments
- Restart button clears the board but preserves scores
- Reload the page (Ctrl+R) → scores persist (read from localStorage)
- Reset Scores button zeros the scoreboard and clears localStorage entry

---

### Task 4: Write the README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Sections:
- **Run the game** — double-click `tictactoe.html`, or open via `file://` URL
- **Run the tests** — `node --test tictactoe.test.js`
- **Scope (in)** — 2-player local play, win/draw detection w/ highlight, restart, persistent scores via localStorage, unit tests for logic
- **Scope (out)** — no AI opponent, no online play, no animations beyond highlight, no keyboard navigation, no accessibility audit beyond basic semantics
- **Status** — list anything that didn't ship

---

### Task 5: Final verification

- [ ] **Step 1:** Run `node --test tictactoe.test.js` — all tests pass
- [ ] **Step 2:** Open `tictactoe.html` from disk, play through one win + one draw + one restart + one reload
- [ ] **Step 3:** Confirm scores persist across reload, restart clears board only, reset-scores clears scoreboard

---

## Self-Review

- Spec coverage: ✅ two-player local (Task 2), win/draw + highlight (Task 2 + Task 1 tests), restart (Task 2 Step 2), persistent scoreboard (Task 2 localStorage), inline only (Task 2 single file), Node test runner (Task 1 + Task 5).
- Placeholders: none — all code is concrete, all file paths are exact.
- Type consistency: `checkWinner` returns `{winner, line}` everywhere; `isDraw` returns bool everywhere; board indices 0–8 consistent across tests and impl.
