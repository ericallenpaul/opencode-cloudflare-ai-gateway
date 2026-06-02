# Tic-Tac-Toe Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained tic-tac-toe game in a single HTML file with persistent scoring and command-line testable game logic.

**Architecture:** Pure vanilla JavaScript with inline CSS. Game state managed in-memory, scores persisted to localStorage. Win/draw detection logic extracted as pure functions for testability. Node.js VM-based test harness loads and executes the game logic from the HTML file.

**Tech Stack:** HTML5, vanilla JavaScript, CSS Grid, localStorage, Node.js built-in test runner (node:test)

---

## File Structure

**Created:**
- `tictactoe.html` - Complete game (HTML structure, CSS, JavaScript game logic, UI interaction, localStorage integration)
- `tictactoe.test.js` - Unit tests for win/draw detection logic using Node.js built-in test runner
- `README.md` - Usage instructions and scope documentation

**No modifications to existing files.**

---

## Task 1: Test Infrastructure

**Files:**
- Create: `tictactoe.test.js`

- [ ] **Step 1: Write test harness that extracts JavaScript from HTML**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Extract JavaScript from HTML file for testing
const html = readFileSync(join(__dirname, 'tictactoe.html'), 'utf-8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('No script tag found in HTML');

// Execute in isolated context to extract testable functions
const { createContext, runInContext } = await import('node:vm');
const sandbox = {
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  document: {},
  window: {},
};
const context = createContext(sandbox);
runInContext(scriptMatch[1], context);

// Export functions for testing
export const { checkWinner, checkDraw, getWinningLine } = sandbox;

test('test harness loads successfully', () => {
  assert.ok(checkWinner, 'checkWinner function should be exported');
  assert.ok(checkDraw, 'checkDraw function should be exported');
  assert.ok(getWinningLine, 'getWinningLine function should be exported');
});
```

- [ ] **Step 2: Create minimal HTML file for test harness**

Create `tictactoe.html` with minimal script:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tic-Tac-Toe</title>
</head>
<body>
  <script>
    // Game logic functions will be implemented here
    function checkWinner(board) {
      return null;
    }

    function checkDraw(board) {
      return false;
    }

    function getWinningLine(board) {
      return null;
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Run test to verify harness works**

Run: `node --test tictactoe.test.js`
Expected: PASS - test harness loads successfully

- [ ] **Step 4: Commit test infrastructure**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "test: add test harness for tic-tac-toe game logic"
```

---

## Task 2: Horizontal Win Detection (TDD)

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Write failing test for horizontal wins**

Add to `tictactoe.test.js`:

```javascript
test('checkWinner detects horizontal win in row 0', () => {
  const board = ['X', 'X', 'X', null, null, null, null, null, null];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects horizontal win in row 1', () => {
  const board = [null, null, null, 'O', 'O', 'O', null, null, null];
  assert.equal(checkWinner(board), 'O');
});

test('checkWinner detects horizontal win in row 2', () => {
  const board = [null, null, null, null, null, null, 'X', 'X', 'X'];
  assert.equal(checkWinner(board), 'X');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 3 FAIL - horizontal win tests fail

- [ ] **Step 3: Implement horizontal win detection**

Update `checkWinner` in `tictactoe.html`:

```javascript
function checkWinner(board) {
  // Check horizontal wins
  for (let row = 0; row < 3; row++) {
    const start = row * 3;
    if (board[start] &&
        board[start] === board[start + 1] &&
        board[start] === board[start + 2]) {
      return board[start];
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit horizontal win detection**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "feat: implement horizontal win detection"
```

---

## Task 3: Vertical Win Detection (TDD)

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Write failing tests for vertical wins**

Add to `tictactoe.test.js`:

```javascript
test('checkWinner detects vertical win in column 0', () => {
  const board = ['X', null, null, 'X', null, null, 'X', null, null];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects vertical win in column 1', () => {
  const board = [null, 'O', null, null, 'O', null, null, 'O', null];
  assert.equal(checkWinner(board), 'O');
});

test('checkWinner detects vertical win in column 2', () => {
  const board = [null, null, 'X', null, null, 'X', null, null, 'X'];
  assert.equal(checkWinner(board), 'X');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 3 FAIL - vertical win tests fail

- [ ] **Step 3: Implement vertical win detection**

Update `checkWinner` in `tictactoe.html`:

```javascript
function checkWinner(board) {
  // Check horizontal wins
  for (let row = 0; row < 3; row++) {
    const start = row * 3;
    if (board[start] &&
        board[start] === board[start + 1] &&
        board[start] === board[start + 2]) {
      return board[start];
    }
  }

  // Check vertical wins
  for (let col = 0; col < 3; col++) {
    if (board[col] &&
        board[col] === board[col + 3] &&
        board[col] === board[col + 6]) {
      return board[col];
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit vertical win detection**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "feat: implement vertical win detection"
```

---

## Task 4: Diagonal Win Detection (TDD)

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Write failing tests for diagonal wins**

Add to `tictactoe.test.js`:

```javascript
test('checkWinner detects diagonal win (top-left to bottom-right)', () => {
  const board = ['X', null, null, null, 'X', null, null, null, 'X'];
  assert.equal(checkWinner(board), 'X');
});

test('checkWinner detects diagonal win (top-right to bottom-left)', () => {
  const board = [null, null, 'O', null, 'O', null, 'O', null, null];
  assert.equal(checkWinner(board), 'O');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 2 FAIL - diagonal win tests fail

- [ ] **Step 3: Implement diagonal win detection**

Update `checkWinner` in `tictactoe.html`:

```javascript
function checkWinner(board) {
  // Check horizontal wins
  for (let row = 0; row < 3; row++) {
    const start = row * 3;
    if (board[start] &&
        board[start] === board[start + 1] &&
        board[start] === board[start + 2]) {
      return board[start];
    }
  }

  // Check vertical wins
  for (let col = 0; col < 3; col++) {
    if (board[col] &&
        board[col] === board[col + 3] &&
        board[col] === board[col + 6]) {
      return board[col];
    }
  }

  // Check diagonal wins
  if (board[0] && board[0] === board[4] && board[0] === board[8]) {
    return board[0];
  }
  if (board[2] && board[2] === board[4] && board[2] === board[6]) {
    return board[2];
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit diagonal win detection**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "feat: implement diagonal win detection"
```

---

## Task 5: Draw Detection (TDD)

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Write failing tests for draw detection**

Add to `tictactoe.test.js`:

```javascript
test('checkDraw returns false for incomplete game', () => {
  const board = ['X', 'O', 'X', null, null, null, null, null, null];
  assert.equal(checkDraw(board), false);
});

test('checkDraw returns false when there is a winner', () => {
  const board = ['X', 'X', 'X', 'O', 'O', null, null, null, null];
  assert.equal(checkDraw(board), false);
});

test('checkDraw returns true for a full board with no winner', () => {
  const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
  assert.equal(checkDraw(board), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 3 FAIL - draw detection tests fail

- [ ] **Step 3: Implement draw detection**

Update `checkDraw` in `tictactoe.html`:

```javascript
function checkDraw(board) {
  // Not a draw if there's a winner
  if (checkWinner(board)) return false;

  // Draw if board is full and no winner
  return board.every(cell => cell !== null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit draw detection**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "feat: implement draw detection"
```

---

## Task 6: Winning Line Detection (TDD)

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Write failing tests for winning line detection**

Add to `tictactoe.test.js`:

```javascript
test('getWinningLine returns horizontal line indices', () => {
  const board = ['X', 'X', 'X', null, null, null, null, null, null];
  assert.deepEqual(getWinningLine(board), [0, 1, 2]);
});

test('getWinningLine returns vertical line indices', () => {
  const board = ['X', null, null, 'X', null, null, 'X', null, null];
  assert.deepEqual(getWinningLine(board), [0, 3, 6]);
});

test('getWinningLine returns diagonal line indices', () => {
  const board = ['X', null, null, null, 'X', null, null, null, 'X'];
  assert.deepEqual(getWinningLine(board), [0, 4, 8]);
});

test('getWinningLine returns null for no winner', () => {
  const board = ['X', 'O', null, null, null, null, null, null, null];
  assert.equal(getWinningLine(board), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 4 FAIL - winning line tests fail

- [ ] **Step 3: Implement winning line detection**

Update `getWinningLine` in `tictactoe.html`:

```javascript
function getWinningLine(board) {
  // Check horizontal wins
  for (let row = 0; row < 3; row++) {
    const start = row * 3;
    if (board[start] &&
        board[start] === board[start + 1] &&
        board[start] === board[start + 2]) {
      return [start, start + 1, start + 2];
    }
  }

  // Check vertical wins
  for (let col = 0; col < 3; col++) {
    if (board[col] &&
        board[col] === board[col + 3] &&
        board[col] === board[col + 6]) {
      return [col, col + 3, col + 6];
    }
  }

  // Check diagonal wins
  if (board[0] && board[0] === board[4] && board[0] === board[8]) {
    return [0, 4, 8];
  }
  if (board[2] && board[2] === board[4] && board[2] === board[6]) {
    return [2, 4, 6];
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit winning line detection**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "feat: implement winning line detection"
```

---

## Task 7: Score Persistence Functions (TDD)

**Files:**
- Modify: `tictactoe.test.js`
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Write failing tests for score persistence**

Add to `tictactoe.test.js`:

```javascript
test('loadScores returns default scores when localStorage is empty', () => {
  const mockStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  const scores = loadScores(mockStorage);
  assert.deepEqual(scores, { X: 0, O: 0, draws: 0 });
});

test('loadScores parses scores from localStorage', () => {
  const mockStorage = {
    getItem: () => '{"X":3,"O":2,"draws":1}',
    setItem: () => {},
  };
  const scores = loadScores(mockStorage);
  assert.deepEqual(scores, { X: 3, O: 2, draws: 1 });
});

test('saveScores writes scores to localStorage', () => {
  let saved = null;
  const mockStorage = {
    getItem: () => null,
    setItem: (key, value) => { saved = { key, value }; },
  };
  saveScores(mockStorage, { X: 5, O: 3, draws: 2 });
  assert.equal(saved.key, 'tictactoe-scores');
  assert.equal(saved.value, '{"X":5,"O":3,"draws":2}');
});
```

- [ ] **Step 2: Update test harness to export score functions**

Update the sandbox export line in `tictactoe.test.js`:

```javascript
export const { checkWinner, checkDraw, getWinningLine, loadScores, saveScores } = sandbox;
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tictactoe.test.js`
Expected: 3 FAIL - score persistence tests fail

- [ ] **Step 4: Implement score persistence functions**

Add to `tictactoe.html` script:

```javascript
function loadScores(storage = localStorage) {
  const saved = storage.getItem('tictactoe-scores');
  if (saved) {
    return JSON.parse(saved);
  }
  return { X: 0, O: 0, draws: 0 };
}

function saveScores(storage = localStorage, scores) {
  storage.setItem('tictactoe-scores', JSON.stringify(scores));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 6: Commit score persistence**

```bash
git add tictactoe.test.js tictactoe.html
git commit -m "feat: implement score persistence functions"
```

---

## Task 8: Complete HTML Structure and Styling

**Files:**
- Modify: `tictactoe.html`

- [ ] **Step 1: Add complete HTML structure with game board**

Update `tictactoe.html` to include full HTML structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tic-Tac-Toe</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .container {
      text-align: center;
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }

    h1 {
      color: #333;
      margin-bottom: 1.5rem;
    }

    .board {
      display: grid;
      grid-template-columns: repeat(3, 100px);
      grid-template-rows: repeat(3, 100px);
      gap: 8px;
      margin: 1.5rem auto;
      background: #ddd;
      padding: 8px;
      border-radius: 8px;
    }

    .cell {
      background: white;
      border: none;
      font-size: 2rem;
      font-weight: bold;
      cursor: pointer;
      transition: background 0.2s;
      border-radius: 4px;
    }

    .cell:hover:not(:disabled) {
      background: #f0f0f0;
    }

    .cell:disabled {
      cursor: not-allowed;
    }

    .cell.winner {
      background: #4caf50;
      color: white;
    }

    .status {
      font-size: 1.2rem;
      font-weight: bold;
      color: #333;
      margin-bottom: 1rem;
      min-height: 1.5rem;
    }

    .restart-btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 0.75rem 2rem;
      font-size: 1rem;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 1rem;
      transition: background 0.2s;
    }

    .restart-btn:hover {
      background: #5568d3;
    }

    .scores {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 2px solid #eee;
    }

    .scores h2 {
      font-size: 1.1rem;
      color: #666;
      margin-bottom: 0.75rem;
    }

    .score-grid {
      display: flex;
      justify-content: center;
      gap: 2rem;
    }

    .score-item {
      text-align: center;
    }

    .score-label {
      font-size: 0.9rem;
      color: #888;
      margin-bottom: 0.25rem;
    }

    .score-value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Tic-Tac-Toe</h1>
    <div class="status" id="status">Player X's turn</div>
    <div class="board" id="board">
      <button class="cell" data-index="0"></button>
      <button class="cell" data-index="1"></button>
      <button class="cell" data-index="2"></button>
      <button class="cell" data-index="3"></button>
      <button class="cell" data-index="4"></button>
      <button class="cell" data-index="5"></button>
      <button class="cell" data-index="6"></button>
      <button class="cell" data-index="7"></button>
      <button class="cell" data-index="8"></button>
    </div>
    <button class="restart-btn" id="restart">Restart Game</button>
    <div class="scores">
      <h2>Score</h2>
      <div class="score-grid">
        <div class="score-item">
          <div class="score-label">Player X</div>
          <div class="score-value" id="score-x">0</div>
        </div>
        <div class="score-item">
          <div class="score-label">Player O</div>
          <div class="score-value" id="score-o">0</div>
        </div>
        <div class="score-item">
          <div class="score-label">Draws</div>
          <div class="score-value" id="score-draws">0</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Game logic functions (already implemented in previous tasks)
    function checkWinner(board) {
      // Check horizontal wins
      for (let row = 0; row < 3; row++) {
        const start = row * 3;
        if (board[start] &&
            board[start] === board[start + 1] &&
            board[start] === board[start + 2]) {
          return board[start];
        }
      }

      // Check vertical wins
      for (let col = 0; col < 3; col++) {
        if (board[col] &&
            board[col] === board[col + 3] &&
            board[col] === board[col + 6]) {
          return board[col];
        }
      }

      // Check diagonal wins
      if (board[0] && board[0] === board[4] && board[0] === board[8]) {
        return board[0];
      }
      if (board[2] && board[2] === board[4] && board[2] === board[6]) {
        return board[2];
      }

      return null;
    }

    function checkDraw(board) {
      if (checkWinner(board)) return false;
      return board.every(cell => cell !== null);
    }

    function getWinningLine(board) {
      // Check horizontal wins
      for (let row = 0; row < 3; row++) {
        const start = row * 3;
        if (board[start] &&
            board[start] === board[start + 1] &&
            board[start] === board[start + 2]) {
          return [start, start + 1, start + 2];
        }
      }

      // Check vertical wins
      for (let col = 0; col < 3; col++) {
        if (board[col] &&
            board[col] === board[col + 3] &&
            board[col] === board[col + 6]) {
          return [col, col + 3, col + 6];
        }
      }

      // Check diagonal wins
      if (board[0] && board[0] === board[4] && board[0] === board[8]) {
        return [0, 4, 8];
      }
      if (board[2] && board[2] === board[4] && board[2] === board[6]) {
        return [2, 4, 6];
      }

      return null;
    }

    function loadScores(storage = localStorage) {
      const saved = storage.getItem('tictactoe-scores');
      if (saved) {
        return JSON.parse(saved);
      }
      return { X: 0, O: 0, draws: 0 };
    }

    function saveScores(storage = localStorage, scores) {
      storage.setItem('tictactoe-scores', JSON.stringify(scores));
    }

    // Game state and UI will be added in next task
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify tests still pass after HTML changes**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit HTML structure and styling**

```bash
git add tictactoe.html
git commit -m "feat: add complete HTML structure and styling"
```

---

## Task 9: Game Interaction and State Management

**Files:**
- Modify: `tictactoe.html` (script section)

- [ ] **Step 1: Add game state and initialization**

Add to the script section in `tictactoe.html`, after the helper functions:

```javascript
// Game state
let board = Array(9).fill(null);
let currentPlayer = 'X';
let gameOver = false;
let scores = loadScores();

// DOM elements
const cells = document.querySelectorAll('.cell');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const scoreXEl = document.getElementById('score-x');
const scoreOEl = document.getElementById('score-o');
const scoreDrawsEl = document.getElementById('score-draws');

// Initialize game
function init() {
  updateScoreDisplay();
  cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
  });
  restartBtn.addEventListener('click', restartGame);
}

function updateScoreDisplay() {
  scoreXEl.textContent = scores.X;
  scoreOEl.textContent = scores.O;
  scoreDrawsEl.textContent = scores.draws;
}

function handleCellClick(e) {
  const index = parseInt(e.target.dataset.index);

  if (board[index] || gameOver) return;

  board[index] = currentPlayer;
  e.target.textContent = currentPlayer;
  e.target.disabled = true;

  const winner = checkWinner(board);
  if (winner) {
    gameOver = true;
    const winningLine = getWinningLine(board);
    winningLine.forEach(i => {
      cells[i].classList.add('winner');
    });
    statusEl.textContent = `Player ${winner} wins!`;
    scores[winner]++;
    saveScores(localStorage, scores);
    updateScoreDisplay();
    return;
  }

  if (checkDraw(board)) {
    gameOver = true;
    statusEl.textContent = "It's a draw!";
    scores.draws++;
    saveScores(localStorage, scores);
    updateScoreDisplay();
    return;
  }

  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
  statusEl.textContent = `Player ${currentPlayer}'s turn`;
}

function restartGame() {
  board = Array(9).fill(null);
  currentPlayer = 'X';
  gameOver = false;
  statusEl.textContent = "Player X's turn";

  cells.forEach(cell => {
    cell.textContent = '';
    cell.disabled = false;
    cell.classList.remove('winner');
  });
}

// Start game when page loads
if (typeof document !== 'undefined') {
  init();
}
```

- [ ] **Step 2: Verify tests still pass**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS

- [ ] **Step 3: Manual test - open HTML in browser**

Open `tictactoe.html` in a browser (double-click or file:// URL)
Expected:
- Game board displays
- Clicking cells alternates X and O
- Win detection works with highlighted line
- Restart button resets board
- Scores persist after page reload

- [ ] **Step 4: Commit game interaction**

```bash
git add tictactoe.html
git commit -m "feat: add game interaction and state management"
```

---

## Task 10: Documentation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README documentation**

```markdown
# Tic-Tac-Toe Game

A self-contained tic-tac-toe game implemented as a single HTML file with persistent scoring.

## How to Play

1. **Open the game**: Double-click `tictactoe.html` or open it in any modern web browser
2. **Take turns**: Click cells to place X or O (players alternate automatically)
3. **Win conditions**: Get three in a row (horizontal, vertical, or diagonal)
4. **Restart**: Click the "Restart Game" button to start a new round
5. **Score tracking**: Wins and draws are tracked and persist across browser sessions

## How to Run Tests

The game includes unit tests for win/draw detection logic.

**Requirements**: Node.js 18+ (uses built-in test runner)

**Run all tests**:
```bash
node --test tictactoe.test.js
```

**Expected output**: All tests pass (17 tests total)

## Scope

**Included**:
- ✅ Two-player local play (X vs O)
- ✅ Visual win detection with highlighted winning line
- ✅ Draw detection
- ✅ Restart button
- ✅ Persistent score tracking via localStorage
- ✅ Works from file:// URLs (no server required)
- ✅ No external dependencies
- ✅ Unit tests runnable with Node.js built-in test runner

**Not Included**:
- ❌ Single-player AI opponent
- ❌ Online multiplayer
- ❌ Mobile app version
- ❌ Undo/redo functionality
- ❌ Customizable player names or symbols

## Technical Details

- **Technology**: Pure vanilla JavaScript, HTML5, CSS3
- **Storage**: localStorage for score persistence
- **Testing**: Node.js VM-based test harness extracts and tests game logic
- **Browser compatibility**: Modern browsers with localStorage support (Chrome, Firefox, Safari, Edge)

## File Structure

- `tictactoe.html` - Complete game (HTML, CSS, JavaScript)
- `tictactoe.test.js` - Unit tests for game logic
- `README.md` - This file
```

- [ ] **Step 2: Commit documentation**

```bash
git add README.md
git commit -m "docs: add README with usage instructions"
```

---

## Task 11: Final Verification

**Files:**
- No modifications

- [ ] **Step 1: Run complete test suite**

Run: `node --test tictactoe.test.js`
Expected: All tests PASS (17 tests)

- [ ] **Step 2: Verify HTML file structure**

Run: `grep -c "<script>" tictactoe.html && grep -c "</script>" tictactoe.html`
Expected: Both return 1 (single script tag)

Run: `grep -c "http://" tictactoe.html && grep -c "https://" tictactoe.html && grep -c "src=" tictactoe.html`
Expected: All return 0 (no external dependencies)

- [ ] **Step 3: Test file:// URL loading**

Manual verification:
1. Open `tictactoe.html` in browser from file://
2. Play a complete game
3. Reload page
4. Verify scores persist

Expected: Game works fully from file:// URL and scores persist

- [ ] **Step 4: Verify deliverables checklist**

Check all files exist:
- [ ] `tictactoe.html` exists and is self-contained
- [ ] `tictactoe.test.js` exists and passes all tests
- [ ] `README.md` exists with complete documentation
- [ ] No external dependencies or build artifacts

- [ ] **Step 5: Final commit**

```bash
git log --oneline -10
```

Expected: Should see commits for all major tasks

---

## Self-Review

**Spec Coverage:**
- ✅ Two-player local play → Implemented in Task 9
- ✅ Visual win/draw detection → Implemented in Tasks 2-5
- ✅ Winning line highlighting → Implemented in Task 6 + Task 9
- ✅ Restart button → Implemented in Task 9
- ✅ Persistent score tracker → Implemented in Task 7 + Task 9
- ✅ Inline CSS/JS only → Implemented in Task 8 + Task 9
- ✅ file:// URL support → Verified in Task 11
- ✅ Command-line tests → Implemented in Tasks 1-7
- ✅ README documentation → Implemented in Task 10

**Placeholder Scan:** None found - all code blocks are complete

**Type Consistency:**
- `board` is consistently `Array(9)` with `null` for empty cells
- `checkWinner(board)` returns `'X' | 'O' | null`
- `checkDraw(board)` returns `boolean`
- `getWinningLine(board)` returns `Array<number> | null`
- `loadScores(storage?)` returns `{ X: number, O: number, draws: number }`
- `saveScores(storage?, scores)` returns `void`

All types are consistent across tasks.
