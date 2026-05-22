# Tic Tac Toe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained, disk-runnable tic-tac-toe game with persistent scores and command-line tests for win/draw logic.

**Architecture:** `tictactoe.html` contains all UI, CSS, and JavaScript. The pure board-status logic is exposed on `globalThis.TicTacToeLogic`, so the browser UI and Node's built-in test runner exercise the same implementation without external dependencies.

**Tech Stack:** Plain HTML, inline CSS, inline JavaScript, browser `localStorage`, Node.js built-in `node:test`, `node:assert`, `node:fs`, and `node:vm`.

---

## File Structure

- Create `tictactoe.html`: single-file browser game with inline styles, inline pure logic, UI event handling, score persistence, restart behavior, win-line highlighting, and accessible status text.
- Create `tictactoe.test.js`: Node built-in tests that read `tictactoe.html`, extract the inline logic script, evaluate it in a VM context, and assert win/draw/in-progress behavior.
- Create `README.md`: concise instructions for opening the game, running tests, scope, and known gaps.
- Create `docs/superpowers/plans/2026-05-22-tic-tac-toe.md`: this implementation plan.

### Task 1: Pure Game-Status Logic

**Files:**
- Create: `tictactoe.test.js`
- Create: `tictactoe.html`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadLogic() {
  const html = fs.readFileSync("tictactoe.html", "utf8");
  const match = html.match(/<script id="tic-tac-toe-logic">([\s\S]*?)<\/script>/);
  assert.ok(match, "logic script should exist in tictactoe.html");
  const context = { globalThis: {} };
  context.window = context.globalThis;
  vm.runInNewContext(match[1], context);
  return context.globalThis.TicTacToeLogic;
}

test("detects an X row win with the winning line indexes", () => {
  const { getGameStatus } = loadLogic();
  const status = getGameStatus(["X", "X", "X", "", "O", "", "O", "", ""]);
  assert.deepEqual(status, {
    state: "win",
    winner: "X",
    line: [0, 1, 2]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tictactoe.test.js`

Expected: FAIL because `tictactoe.html` does not exist or the logic script has not been implemented.

- [ ] **Step 3: Write minimal implementation**

```html
<script id="tic-tac-toe-logic">
(function (root) {
  const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function getGameStatus(board) {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { state: "win", winner: board[a], line };
      }
    }
    return { state: "playing", winner: null, line: [] };
  }

  root.TicTacToeLogic = { WINNING_LINES, getGameStatus };
})(globalThis);
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tictactoe.test.js`

Expected: PASS for the first win detection test.

### Task 2: Draw and In-Progress Detection

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html`

- [ ] **Step 1: Add failing tests**

```javascript
test("detects a draw when the board is full without a winner", () => {
  const { getGameStatus } = loadLogic();
  const status = getGameStatus(["X", "O", "X", "X", "O", "O", "O", "X", "X"]);
  assert.deepEqual(status, {
    state: "draw",
    winner: null,
    line: []
  });
});

test("keeps playing when empty squares remain and no one has won", () => {
  const { getGameStatus } = loadLogic();
  const status = getGameStatus(["X", "O", "X", "", "O", "", "", "X", ""]);
  assert.deepEqual(status, {
    state: "playing",
    winner: null,
    line: []
  });
});
```

- [ ] **Step 2: Run tests to verify the draw test fails**

Run: `node --test tictactoe.test.js`

Expected: FAIL because a full board without a winner still returns `playing`.

- [ ] **Step 3: Implement draw detection**

```javascript
if (board.every(Boolean)) {
  return { state: "draw", winner: null, line: [] };
}
return { state: "playing", winner: null, line: [] };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`

Expected: PASS for win, draw, and in-progress status tests.

### Task 3: Browser Game UI and Score Persistence

**Files:**
- Modify: `tictactoe.html`

- [ ] **Step 1: Add browser markup and UI script**

Use semantic controls for the board cells, status, score values, restart, and reset-score actions. Store scores in `localStorage` under `ticTacToeScores`.

- [ ] **Step 2: Wire game interactions**

The UI script should:
- Start with X's turn.
- Ignore occupied cells and clicks after a completed game.
- Call `getGameStatus(board)` after each move.
- Highlight cells listed in `status.line` when `state === "win"`.
- Increment X, O, or draw scores exactly once per completed game.
- Persist scores with `localStorage.setItem`.
- Reset only the board on restart, leaving scores intact.

- [ ] **Step 3: Manually verify browser behavior**

Open `tictactoe.html` from disk and play:
- X wins top row: top row highlights and X score increments.
- Restart: board clears and score remains.
- Full draw: draw score increments.

### Task 4: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Document usage**

Include:
- Open game: double-click `tictactoe.html` or open it with a `file://` URL.
- Run tests: `node --test tictactoe.test.js`.
- Scope: local two-player tic-tac-toe, score persistence, no AI, no network, no build step.
- Known gaps: none if verification passes.

### Task 5: Final Verification

**Files:**
- Verify: `tictactoe.html`
- Verify: `tictactoe.test.js`
- Verify: `README.md`

- [ ] **Step 1: Run command-line tests**

Run: `node --test tictactoe.test.js`

Expected: all tests pass with exit code 0.

- [ ] **Step 2: Confirm HTML loads as parseable content**

Run a Node script that reads `tictactoe.html`, confirms required UI IDs exist, extracts/evaluates the logic script, and confirms `TicTacToeLogic.getGameStatus` is a function.

- [ ] **Step 3: Confirm score persistence logic**

Run a Node VM script over the HTML with a minimal DOM/localStorage stub. Simulate moves for an X win, create a second VM session with the same storage object, and verify the X score still renders as `1`.

- [ ] **Step 4: Review deliverables**

Confirm `tictactoe.html`, `tictactoe.test.js`, and `README.md` exist and match the requested scope.

## Self-Review

- Spec coverage: The plan maps every requested game behavior to Tasks 1-3, command-line unit tests to Tasks 1-2 and 5, and README documentation to Task 4.
- Placeholder scan: No placeholders or deferred behavior remain.
- Type consistency: `getGameStatus(board)` consistently returns `{ state, winner, line }`; UI and tests both consume that shape.
