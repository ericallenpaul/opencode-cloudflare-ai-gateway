# Tic-Tac-Toe (Single HTML) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained tic-tac-toe game as a single HTML file with inline CSS/JS, local two-player play, visual win/draw detection, restart, and persistent scores via localStorage. Provide Node built-in tests for win/draw and score persistence helpers.

**Architecture:** UI and event handling live in a single `tictactoe.html`. Core game logic is a pure, framework-free block exported to `globalThis.TicTacToe` inside the HTML. Tests read `tictactoe.html`, extract the marked logic block, eval it in a VM sandbox, and test pure functions (winner/draw and score persistence helpers). No external deps.

**Tech Stack:** HTML5 + inline CSS/JS. Node `node:test` for tests. No build, no npm.

---

### Task 1: Scaffold HTML + logic export stubs

**Files:**
- Create: `tictactoe.html`

- [ ] Add minimal HTML skeleton with board, status, restart, and scoreboard containers

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tic-Tac-Toe</title>
  <style>
    /* Inline CSS, grid board */
    :root { --cell: 120px; --gap: 8px; }
    body { font-family: system-ui, Arial, sans-serif; display:flex; min-height:100vh; align-items:center; justify-content:center; background:#111; color:#eee; }
    .wrap { text-align:center; }
    .board { display:grid; grid-template-columns: repeat(3, var(--cell)); grid-template-rows: repeat(3, var(--cell)); gap: var(--gap); margin: 16px auto; }
    .cell { background:#1e1e1e; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:64px; cursor:pointer; user-select:none; transition:background .15s ease; }
    .cell:hover { background:#262626; }
    .cell.win { background:#0a3; color:#fff; box-shadow: 0 0 0 2px #0a3 inset; }
    .panel { display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap; }
    button { background:#2d2d2d; color:#eee; border:1px solid #444; padding:8px 14px; border-radius:8px; cursor:pointer; }
    button:hover { background:#383838; }
    .status { min-height: 1.5em; font-weight:600; }
    .scores { display:flex; gap:16px; justify-content:center; margin-top:8px; font-variant-numeric: tabular-nums; }
    .scores .label { color:#aaa; }
  </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Tic-Tac-Toe</h1>
      <div class="panel">
        <div class="status" id="status">X to move</div>
        <button id="restart">Restart</button>
        <button id="resetScores" title="Reset persisted scores">Reset Scores</button>
      </div>
      <div class="board" id="board" aria-label="Tic-Tac-Toe Board" role="grid"></div>
      <div class="scores" id="scores">
        <div><span class="label">X wins:</span> <span id="scoreX">0</span></div>
        <div><span class="label">O wins:</span> <span id="scoreO">0</span></div>
        <div><span class="label">Draws:</span> <span id="scoreD">0</span></div>
      </div>
    </div>

    <script>
    // LOGIC_EXPORT_START
    // Pure game logic and score helpers exposed to globalThis.TicTacToe
    (function(){
      const winningLines = [
        [0,1,2],[3,4,5],[6,7,8], // rows
        [0,3,6],[1,4,7],[2,5,8], // cols
        [0,4,8],[2,4,6]          // diags
      ];
      function calcWinner(board){
        // stub: return no winner
        return { winner: null, line: null };
      }
      function isDraw(board){
        // stub: never a draw
        return false;
      }
      function loadScore(storage){
        const parse = (k)=>{ const v = storage && storage.getItem ? storage.getItem(k) : null; return v==null?0: (parseInt(v,10)||0); };
        return { x: parse('ttt.x'), o: parse('ttt.o'), d: parse('ttt.d') };
      }
      function saveScore(storage, s){
        if (!storage || !storage.setItem) return;
        storage.setItem('ttt.x', String(s.x|0));
        storage.setItem('ttt.o', String(s.o|0));
        storage.setItem('ttt.d', String(s.d|0));
      }
      globalThis.TicTacToe = { winningLines, calcWinner, isDraw, loadScore, saveScore };
    })();
    // LOGIC_EXPORT_END

    // UI wiring (will be completed in later tasks)
    (function(){
      const boardEl = document.getElementById('board');
      const statusEl = document.getElementById('status');
      const restartBtn = document.getElementById('restart');
      const resetScoresBtn = document.getElementById('resetScores');
      const scoreXEl = document.getElementById('scoreX');
      const scoreOEl = document.getElementById('scoreO');
      const scoreDEl = document.getElementById('scoreD');

      const state = { board: Array(9).fill(''), xToMove: true, gameOver: false, score: TicTacToe.loadScore(localStorage) };

      function renderScores(){ scoreXEl.textContent = state.score.x; scoreOEl.textContent = state.score.o; scoreDEl.textContent = state.score.d; }
      function setStatus(msg){ statusEl.textContent = msg; }
      function cellEl(i){ return boardEl.querySelector(`[data-idx="${i}"]`); }
      function clearWinHighlights(){ boardEl.querySelectorAll('.cell.win').forEach(c=>c.classList.remove('win')); }

      function renderBoard(){
        boardEl.innerHTML = '';
        for(let i=0;i<9;i++){
          const d=document.createElement('div'); d.className='cell'; d.setAttribute('role','gridcell'); d.dataset.idx=String(i); d.textContent=state.board[i];
          d.addEventListener('click', ()=>onCell(i));
          boardEl.appendChild(d);
        }
        clearWinHighlights();
      }

      function onCell(i){
        if (state.gameOver || state.board[i]) return;
        state.board[i] = state.xToMove ? 'X' : 'O';
        state.xToMove = !state.xToMove;
        const res = TicTacToe.calcWinner(state.board);
        if (res.winner){
          state.gameOver = true;
          setStatus(`${res.winner} wins!`);
          res.line.forEach(idx=> cellEl(idx).classList.add('win'));
          if (res.winner==='X') state.score.x++; else state.score.o++;
          TicTacToe.saveScore(localStorage, state.score); renderScores();
        } else if (TicTacToe.isDraw(state.board)){
          state.gameOver = true; setStatus(`Draw.`); state.score.d++; TicTacToe.saveScore(localStorage, state.score); renderScores();
        } else {
          setStatus(`${state.xToMove? 'X':'O'} to move`);
        }
        renderBoard();
      }

      function restart(){ state.board = Array(9).fill(''); state.xToMove = true; state.gameOver=false; setStatus('X to move'); renderBoard(); }
      function resetScores(){ state.score = {x:0,o:0,d:0}; TicTacToe.saveScore(localStorage,state.score); renderScores(); }

      restartBtn.addEventListener('click', restart);
      resetScoresBtn.addEventListener('click', resetScores);

      renderScores();
      renderBoard();
      setStatus('X to move');
    })();
    </script>
  </body>
  </html>
```

Expected: page can open, but logic stubs cause tests to fail initially.

---

### Task 2: Write first failing test (X horizontal win)

**Files:**
- Create: `tictactoe.test.js`

- [ ] Implement test harness to extract logic from HTML and run a single failing test for an X row win.

```js
// tictactoe.test.js (cycle 1)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadLogic(){
  const html = fs.readFileSync('./tictactoe.html','utf8');
  const m = /\/\/\s*LOGIC_EXPORT_START([\s\S]*?)\/\/\s*LOGIC_EXPORT_END/.exec(html);
  if (!m) throw new Error('Logic block not found');
  const code = m[1];
  const sandbox = { console };
  vm.runInNewContext(code, sandbox, { filename: 'logic-inline.js' });
  return sandbox.TicTacToe;
}

describe('TicTacToe logic - cycle 1', () => {
  test('detects X horizontal win on top row', () => {
    const { calcWinner } = loadLogic();
    const board = [ 'X','X','X', '', '', '', '', '', '' ];
    const r = calcWinner(board);
    assert.equal(r.winner, 'X');
    assert.deepEqual(r.line, [0,1,2]);
  });
});
```

- [ ] Run test to verify failure

Run: `node --test tictactoe.test.js`

Expected: FAIL - `r.winner` is `null` from stub implementation.

---

### Task 3: Implement winner detection to pass first test

**Files:**
- Modify: `tictactoe.html` (logic block `calcWinner` implementation)

- [ ] Minimal implementation respecting existing `winningLines` constant.

```js
function calcWinner(board){
  for (const [a,b,c] of winningLines){
    const v = board[a];
    if (v && v === board[b] && v === board[c]){
      return { winner: v, line: [a,b,c] };
    }
  }
  return { winner: null, line: null };
}
```

- [ ] Run the single test again

Run: `node --test tictactoe.test.js`

Expected: PASS for the one test.

---

### Task 4: Add failing tests for diagonal/column wins, draws, and score persistence helpers

**Files:**
- Modify: `tictactoe.test.js`

- [ ] Extend tests to cover O diagonal win, column win, draws, and load/save score helpers with a fake storage.

```js
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadLogic(){
  const html = fs.readFileSync('./tictactoe.html','utf8');
  const m = /\/\/\s*LOGIC_EXPORT_START([\s\S]*?)\/\/\s*LOGIC_EXPORT_END/.exec(html);
  if (!m) throw new Error('Logic block not found');
  const code = m[1];
  const sandbox = { console };
  vm.runInNewContext(code, sandbox, { filename: 'logic-inline.js' });
  return sandbox.TicTacToe;
}

describe('TicTacToe logic - cycle 2', () => {
  test('detects O diagonal win', () => {
    const { calcWinner } = loadLogic();
    const board = [ 'O', '', '', '', 'O', '', '', '', 'O' ];
    const r = calcWinner(board);
    assert.equal(r.winner, 'O');
    assert.deepEqual(r.line, [0,4,8]);
  });

  test('detects column win (X in middle column)', () => {
    const { calcWinner } = loadLogic();
    const board = [ '', 'X', '', '', 'X', '', '', 'X', '' ];
    const r = calcWinner(board);
    assert.equal(r.winner, 'X');
    assert.deepEqual(r.line, [1,4,7]);
  });

  test('detects draw when board full and no winner', () => {
    const { isDraw } = loadLogic();
    const board = [ 'X','O','X', 'X','O','O', 'O','X','X' ];
    assert.equal(isDraw(board), true);
  });

  test('score helpers load defaults and persist to storage', () => {
    const { loadScore, saveScore } = loadLogic();
    const fake = (()=>{ const m=new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)) }; })();
    const s0 = loadScore(fake);
    assert.deepEqual(s0, {x:0,o:0,d:0});
    const s1 = {x:2,o:3,d:4};
    saveScore(fake, s1);
    const s2 = loadScore(fake);
    assert.deepEqual(s2, s1);
  });
});
```

- [ ] Run extended tests to see failures (draw helper still stubbed)

Run: `node --test tictactoe.test.js`

Expected: some tests FAIL (draw detection at minimum).

---

### Task 5: Implement draw detection to pass all tests

**Files:**
- Modify: `tictactoe.html` (logic block `isDraw`)

- [ ] Implement `isDraw` as "no empties and no winner".

```js
function isDraw(board){
  const anyEmpty = board.some(v => !v);
  if (anyEmpty) return false;
  const { winner } = calcWinner(board);
  return !winner;
}
```

- [ ] Run full test suite

Run: `node --test tictactoe.test.js`

Expected: PASS all tests.

---

### Task 6: Complete UI wiring and persistence integration

**Files:**
- Modify: `tictactoe.html` (UI IIFE)

- [ ] Ensure: cell clicks mutate board, status updates, wins highlight, scores update and persist via localStorage, restart/reset buttons work, and initial load populates UI from storage.

```js
// Already implemented in scaffold; verify render and persistence paths call saveScore/loadScore
```

- [ ] Manual sanity check: 9 cells render, play results in correct outcomes, restart resets grid but preserves scores, resetScores clears persisted values.

---

### Task 7: README with usage and tests

**Files:**
- Create: `README.md`

- [ ] Write concise instructions for opening HTML and running tests with Node built-in test runner. Scope notes per spec.

---

## Self-Review

1) Spec coverage:
- Single HTML with inline CSS/JS: Task 1 + 6
- Two-player local play: Task 6
- Visual win/draw with highlighted line: Task 6
- Restart button: Task 6
- Persistent scores via localStorage: Task 6 (+ helpers in Tasks 1/5)
- Tests for win/draw detection (and score helpers): Tasks 2–5
- No external deps, runs from disk: Task 1/6

2) Placeholders: No TBDs; code is explicit.

3) Consistency: Function names stable across tasks (`calcWinner`, `isDraw`, `loadScore`, `saveScore`).

---

Plan complete and saved to docs/superpowers/plans/2026-05-21-tic-tac-toe.md.
