# Tic-Tac-Toe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained local two-player tic-tac-toe game with persistent scoring and command-line unit tests.

**Architecture:** `tictactoe.html` contains all CSS, markup, and browser JavaScript so it runs directly from a `file://` URL. The win/draw detection logic lives in a marked inline script block that the Node test file extracts and evaluates, so tests exercise the same production logic used by the browser UI. `README.md` keeps the existing project documentation and adds a short section with game usage, test command, scope, and known gaps.

**Tech Stack:** Static HTML, inline CSS, inline JavaScript, browser `localStorage`, Node.js built-in `node:test`, Node.js built-in `assert`, no npm packages.

---

## File Structure

- Create: `tictactoe.html`  
  Self-contained game UI, styles, pure board-evaluation logic, localStorage-backed scores, event handling, restart behavior.
- Create: `tictactoe.test.js`  
  Node built-in tests that read `tictactoe.html`, extract the production logic between `BEGIN_TICTACTOE_LOGIC` and `END_TICTACTOE_LOGIC`, and assert win/draw/ongoing outcomes.
- Modify: `README.md`  
  Add a concise "Tic-Tac-Toe Benchmark Deliverable" section without removing the existing repository documentation.

## Phased Tasks

### Task 1: Board Evaluation Logic

**Files:**
- Create: `tictactoe.test.js`
- Create: `tictactoe.html`

- [ ] **Step 1: Write the failing tests**

Create `tictactoe.test.js` with tests for the desired production API:

```js
const { readFileSync } = require('node:fs');
const { Script, createContext } = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

function loadLogic() {
  const html = readFileSync('tictactoe.html', 'utf8');
  const match = html.match(/\/\* BEGIN_TICTACTOE_LOGIC \*\/([\s\S]*?)\/\* END_TICTACTOE_LOGIC \*\//);
  assert.ok(match, 'production logic block is present in tictactoe.html');

  const context = createContext({ module: { exports: {} }, exports: {} });
  new Script(match[1], { filename: 'tictactoe.inline-logic.js' }).runInContext(context);
  return context.module.exports;
}

const { evaluateBoard } = loadLogic();

test('detects an X row win and returns the winning indexes', () => {
  assert.deepEqual(evaluateBoard(['X', 'X', 'X', '', 'O', '', 'O', '', '']), {
    winner: 'X',
    winningLine: [0, 1, 2],
    draw: false,
    complete: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tictactoe.test.js`  
Expected: FAIL because `tictactoe.html` or the marked production logic block does not exist yet.

- [ ] **Step 3: Write minimal production logic**

Create `tictactoe.html` with the marked logic block and an `evaluateBoard(board)` function:

```js
/* BEGIN_TICTACTOE_LOGIC */
const TicTacToeLogic = (() => {
  const WINNING_LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  function evaluateBoard(board) {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], winningLine: line, draw: false, complete: true };
      }
    }

    const draw = board.every(Boolean);
    return { winner: null, winningLine: [], draw, complete: draw };
  }

  return { WINNING_LINES, evaluateBoard };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TicTacToeLogic;
}

if (typeof window !== 'undefined') {
  window.TicTacToeLogic = TicTacToeLogic;
}
/* END_TICTACTOE_LOGIC */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tictactoe.test.js`  
Expected: PASS for the first row-win test.

### Task 2: Evaluation Edge Cases

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html`

- [ ] **Step 1: Add failing tests for columns, diagonals, draws, and ongoing games**

Add tests:

```js
test('detects an O column win', () => {
  assert.deepEqual(evaluateBoard(['O', 'X', '', 'O', 'X', '', 'O', '', 'X']), {
    winner: 'O',
    winningLine: [0, 3, 6],
    draw: false,
    complete: true,
  });
});

test('detects a diagonal win', () => {
  assert.deepEqual(evaluateBoard(['X', 'O', '', '', 'X', 'O', '', '', 'X']), {
    winner: 'X',
    winningLine: [0, 4, 8],
    draw: false,
    complete: true,
  });
});

test('detects a draw when the board is full without a winner', () => {
  assert.deepEqual(evaluateBoard(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), {
    winner: null,
    winningLine: [],
    draw: true,
    complete: true,
  });
});

test('keeps an unfinished board in progress', () => {
  assert.deepEqual(evaluateBoard(['X', 'O', 'X', '', '', '', '', '', '']), {
    winner: null,
    winningLine: [],
    draw: false,
    complete: false,
  });
});
```

- [ ] **Step 2: Run tests to verify the new tests fail if behavior is incomplete**

Run: `node --test tictactoe.test.js`  
Expected: PASS if Task 1 implementation already handles all listed lines and draw state; otherwise FAIL with the missing behavior.

- [ ] **Step 3: Extend `evaluateBoard` only if needed**

If a test fails, adjust `WINNING_LINES` or draw detection so all eight win lines and full-board draw detection are represented exactly as shown in Task 1.

- [ ] **Step 4: Run tests to verify green**

Run: `node --test tictactoe.test.js`  
Expected: PASS for all evaluation tests.

### Task 3: Browser Game UI and Persistence

**Files:**
- Modify: `tictactoe.html`

- [ ] **Step 1: Build the single-file UI**

Add semantic markup and inline CSS for:

```html
<main class="game-shell">
  <section class="scoreboard" aria-label="Score">
    <div><span id="score-x">0</span><span>X wins</span></div>
    <div><span id="score-o">0</span><span>O wins</span></div>
    <div><span id="score-draws">0</span><span>Draws</span></div>
  </section>
  <p id="status" aria-live="polite">X's turn</p>
  <div id="board" class="board" aria-label="Tic-tac-toe board"></div>
  <div class="actions">
    <button id="restart" type="button">Restart</button>
    <button id="reset-scores" type="button">Reset scores</button>
  </div>
</main>
```

- [ ] **Step 2: Add UI state management**

Use the production `evaluateBoard(board)` function after each valid click. On a terminal result, update status text, add `.win` to the winning cells, increment exactly one score bucket, save scores to `localStorage`, and disable further moves until restart.

- [ ] **Step 3: Add restart behavior**

The restart button resets the board, current player, status text, and highlighted cells while preserving score values.

- [ ] **Step 4: Add score persistence**

Load score from `localStorage.getItem('ticTacToe:scores:v1')`, default to `{ x: 0, o: 0, draws: 0 }`, tolerate malformed JSON by resetting to defaults, and save after each completed game.

### Task 4: README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add usage section**

Add a section near the top:

```markdown
## Tic-Tac-Toe Benchmark Deliverable

- Open the game: double-click `tictactoe.html`, or run `start .\tictactoe.html` from PowerShell.
- Run tests: `node --test .\tictactoe.test.js`
- Scoped in: local two-player X/O play, win/draw detection, highlighted winning cells, restart, persistent score tracking through `localStorage`, Node tests for board evaluation logic.
- Scoped out: network play, AI opponent, build tooling, external packages.
- Not done: none currently known.
```

### Task 5: Verification

**Files:**
- Test: `tictactoe.test.js`
- Smoke test: `tictactoe.html`

- [ ] **Step 1: Run command-line tests**

Run: `node --test .\tictactoe.test.js`  
Expected: all tests pass with exit code 0.

- [ ] **Step 2: Confirm HTML file loads from disk**

Open `file:///C:/Users/eric.paul/source/repos/opencode-cloudflare-ai-gateway/tictactoe.html` in a browser automation session and verify that the 3x3 board, status text, and score values render.

- [ ] **Step 3: Confirm score persistence**

In the browser session, complete an X win, confirm X wins increments, reload the file URL, and confirm the X score remains incremented.

## Self-Review

- Spec coverage: the plan covers a single HTML file, local two-player turns, win/draw detection, visual win highlighting, restart, persistent localStorage scores, no external dependencies, file URL execution, built-in Node tests, and README instructions.
- Placeholder scan: no task relies on TBD, TODO, or unspecified implementation behavior.
- Type consistency: the planned production API is `evaluateBoard(board)` returning `{ winner, winningLine, draw, complete }`, and the tests and UI consume the same shape.

## Execution Choice

The user required proceeding without approval and specified TDD execution in this same workflow. Execute inline in this session, task by task, using `node --test .\tictactoe.test.js` as the verification command.
