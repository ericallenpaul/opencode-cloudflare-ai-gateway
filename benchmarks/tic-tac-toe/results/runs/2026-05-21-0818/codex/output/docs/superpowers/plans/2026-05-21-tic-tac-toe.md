# Tic-Tac-Toe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained two-player tic-tac-toe game that opens directly from disk and includes command-line unit tests for win/draw detection.

**Architecture:** The game ships as one `tictactoe.html` file with inline CSS and JavaScript. A small pure logic module is embedded in an inline script and exposed as `window.TicTacToeLogic` so Node's built-in test runner can extract and test the exact production win/draw detection logic without a browser dependency.

**Tech Stack:** Plain HTML, inline CSS, inline JavaScript, `localStorage`, Node.js built-in `node:test`, `assert`, `fs`, and `vm`.

---

## File Structure

- Create: `tictactoe.html`
  - Self-contained browser game.
  - Inline styles define the layout, score board, buttons, board state, and winning-line highlight.
  - Inline logic script exposes `evaluateBoard(board)`.
  - Inline app script handles turns, rendering, restart, score persistence, and localStorage reads/writes.
- Create: `tictactoe.test.js`
  - Uses Node built-ins only.
  - Reads `tictactoe.html`, extracts the inline logic script, evaluates it in a VM sandbox, and tests `evaluateBoard`.
- Create: `README.md`
  - Explains how to open `tictactoe.html`, run `node --test tictactoe.test.js`, and understand scope.

### Task 1: Unit Test Harness And Win Lines

**Files:**
- Create: `tictactoe.test.js`
- Create: `tictactoe.html`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadLogic() {
  if (!fs.existsSync('tictactoe.html')) {
    assert.fail('tictactoe.html does not exist');
  }

  const html = fs.readFileSync('tictactoe.html', 'utf8');
  const match = html.match(/<script id="game-logic">([\s\S]*?)<\/script>/);
  assert.ok(match, 'expected an inline script with id="game-logic"');

  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox);
  assert.ok(sandbox.window.TicTacToeLogic, 'expected TicTacToeLogic to be exposed');
  return sandbox.window.TicTacToeLogic;
}

test('detects every winning line with the correct winner and cells', () => {
  const { evaluateBoard } = loadLogic();
  const cases = [
    { board: ['X', 'X', 'X', '', '', '', '', '', ''], winner: 'X', line: [0, 1, 2] },
    { board: ['', '', '', 'O', 'O', 'O', '', '', ''], winner: 'O', line: [3, 4, 5] },
    { board: ['', '', '', '', '', '', 'X', 'X', 'X'], winner: 'X', line: [6, 7, 8] },
    { board: ['O', '', '', 'O', '', '', 'O', '', ''], winner: 'O', line: [0, 3, 6] },
    { board: ['', 'X', '', '', 'X', '', '', 'X', ''], winner: 'X', line: [1, 4, 7] },
    { board: ['', '', 'O', '', '', 'O', '', '', 'O'], winner: 'O', line: [2, 5, 8] },
    { board: ['X', '', '', '', 'X', '', '', '', 'X'], winner: 'X', line: [0, 4, 8] },
    { board: ['', '', 'O', '', 'O', '', 'O', '', ''], winner: 'O', line: [2, 4, 6] },
  ];

  for (const entry of cases) {
    assert.deepEqual(evaluateBoard(entry.board), {
      status: 'win',
      winner: entry.winner,
      line: entry.line,
      lineKey: entry.line.join('-'),
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tictactoe.test.js`

Expected: FAIL with `tictactoe.html does not exist`.

- [ ] **Step 3: Write minimal implementation**

Create `tictactoe.html` with a `game-logic` script that defines `evaluateBoard(board)` and returns win results.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tictactoe.test.js`

Expected: PASS for the win-line test.

### Task 2: Draw And In-Progress Detection

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html`

- [ ] **Step 1: Write failing tests**

Add tests:

```javascript
test('returns draw when the board is full and no player has won', () => {
  const { evaluateBoard } = loadLogic();
  assert.deepEqual(evaluateBoard(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), {
    status: 'draw',
    winner: null,
    line: null,
    lineKey: null,
  });
});

test('returns playing when moves remain and no player has won', () => {
  const { evaluateBoard } = loadLogic();
  assert.deepEqual(evaluateBoard(['X', 'O', 'X', '', 'O', '', '', 'X', '']), {
    status: 'playing',
    winner: null,
    line: null,
    lineKey: null,
  });
});

test('win takes precedence over draw on a full board', () => {
  const { evaluateBoard } = loadLogic();
  assert.deepEqual(evaluateBoard(['X', 'X', 'X', 'O', 'O', 'X', 'O', 'X', 'O']), {
    status: 'win',
    winner: 'X',
    line: [0, 1, 2],
    lineKey: '0-1-2',
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tictactoe.test.js`

Expected: FAIL because draw and playing states are not implemented yet.

- [ ] **Step 3: Implement draw and playing states**

Update `evaluateBoard(board)` to check wins first, then return draw when all cells are filled, else return playing.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tictactoe.test.js`

Expected: PASS for all detection tests.

### Task 3: Browser Game UI And Persistence

**Files:**
- Modify: `tictactoe.html`

- [ ] **Step 1: Write score persistence test**

Extend `tictactoe.test.js` with a production-script extraction test only if app logic is made testable without DOM coupling. Otherwise verify persistence with a command-line VM smoke test after implementation.

- [ ] **Step 2: Implement UI**

Add semantic HTML for:
- Status text.
- Three score counters: X wins, O wins, draws.
- Nine board buttons.
- Restart button.

Add inline CSS for:
- Responsive centered game area.
- Stable 3x3 grid.
- X/O cell states.
- `.winner` cells.
- An overlay `.win-stroke` whose position is controlled by the `lineKey`.

Add inline JavaScript for:
- Current player state.
- Board click handling.
- Calling `evaluateBoard(board)` after each move.
- Disabling input after win/draw.
- Incrementing and saving scores to `localStorage`.
- Restarting the board without clearing scores.

- [ ] **Step 3: Manual smoke path**

Open `tictactoe.html` by file path or with a local file URL and confirm moves can be played, wins/draws show visually, restart clears the board, and scores survive reload through localStorage.

### Task 4: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Document usage**

Add:
- Open instructions: double-click `tictactoe.html`.
- Test instructions: `node --test tictactoe.test.js`.
- Scope in: local two-player play, win/draw detection, highlighted winning line, restart, persistent scores, no dependencies.
- Scope out: AI opponent, online play, score reset button, build tooling.
- Completion notes: state any gaps found during verification.

### Task 5: Final Verification

**Files:**
- Read/execute: `tictactoe.html`, `tictactoe.test.js`, `README.md`

- [ ] **Step 1: Run unit tests**

Run: `node --test tictactoe.test.js`

Expected: exit code 0 with all tests passing.

- [ ] **Step 2: Confirm HTML can load from disk**

Run a command-line smoke check that reads the HTML, extracts inline scripts, and evaluates enough of the browser code to ensure the file does not depend on external assets or build tooling.

- [ ] **Step 3: Confirm score persistence**

Run a command-line smoke check against the app script with a `localStorage` stub, or verify in a browser, confirming an X/O/draw result writes `ticTacToeScores` and a fresh load reads the same values.

- [ ] **Step 4: Review deliverables**

Confirm these files exist:
- `tictactoe.html`
- `tictactoe.test.js`
- `README.md`

## Self-Review

- Spec coverage: The plan covers two-player play, visual win/draw state, highlighted winning line, restart, localStorage score persistence, single-file HTML with inline CSS/JS, file URL operation, built-in Node tests, and README.
- Placeholder scan: No placeholder implementation steps remain. The only conditional note in Task 3 selects a verification strategy based on DOM coupling and does not leave a deliverable unspecified.
- Type consistency: The tested API is consistently `window.TicTacToeLogic.evaluateBoard(board)`, returning `{ status, winner, line, lineKey }`.
