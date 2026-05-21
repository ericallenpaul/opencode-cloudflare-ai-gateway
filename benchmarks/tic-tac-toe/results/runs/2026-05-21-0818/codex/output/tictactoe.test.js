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

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function readHtml() {
  if (!fs.existsSync('tictactoe.html')) {
    assert.fail('tictactoe.html does not exist');
  }

  return fs.readFileSync('tictactoe.html', 'utf8');
}

function createMemoryStorage(initial = {}) {
  const data = { ...initial };

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
  };
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
    assert.deepEqual(plain(evaluateBoard(entry.board)), {
      status: 'win',
      winner: entry.winner,
      line: entry.line,
      lineKey: entry.line.join('-'),
    });
  }
});

test('returns draw when the board is full and no player has won', () => {
  const { evaluateBoard } = loadLogic();

  assert.deepEqual(plain(evaluateBoard(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])), {
    status: 'draw',
    winner: null,
    line: null,
    lineKey: null,
  });
});

test('returns playing when moves remain and no player has won', () => {
  const { evaluateBoard } = loadLogic();

  assert.deepEqual(plain(evaluateBoard(['X', 'O', 'X', '', 'O', '', '', 'X', ''])), {
    status: 'playing',
    winner: null,
    line: null,
    lineKey: null,
  });
});

test('win takes precedence over draw on a full board', () => {
  const { evaluateBoard } = loadLogic();

  assert.deepEqual(plain(evaluateBoard(['X', 'X', 'X', 'O', 'O', 'X', 'O', 'X', 'O'])), {
    status: 'win',
    winner: 'X',
    line: [0, 1, 2],
    lineKey: '0-1-2',
  });
});

test('html contains the required local game controls without external dependencies', () => {
  const html = readHtml();

  assert.equal((html.match(/data-cell-index="/g) || []).length, 9);
  assert.match(html, /id="restart"/);
  assert.match(html, /data-score="X"/);
  assert.match(html, /data-score="O"/);
  assert.match(html, /data-score="draws"/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/i);
});

test('persists and reloads score totals from localStorage-compatible storage', () => {
  const { createScoreStore, SCORE_KEY } = loadLogic();
  const storage = createMemoryStorage();
  const store = createScoreStore(storage);

  assert.equal(SCORE_KEY, 'ticTacToeScores');
  assert.deepEqual(plain(store.load()), { X: 0, O: 0, draws: 0 });

  store.save({ X: 2, O: 1, draws: 3 });

  assert.equal(storage.getItem(SCORE_KEY), JSON.stringify({ X: 2, O: 1, draws: 3 }));
  assert.deepEqual(plain(createScoreStore(storage).load()), { X: 2, O: 1, draws: 3 });
});

test('updates score totals for X wins, O wins, and draws without mutating input', () => {
  const { recordResult } = loadLogic();
  const initial = { X: 0, O: 0, draws: 0 };

  assert.deepEqual(plain(recordResult(initial, { status: 'win', winner: 'X' })), {
    X: 1,
    O: 0,
    draws: 0,
  });
  assert.deepEqual(plain(recordResult(initial, { status: 'win', winner: 'O' })), {
    X: 0,
    O: 1,
    draws: 0,
  });
  assert.deepEqual(plain(recordResult(initial, { status: 'draw', winner: null })), {
    X: 0,
    O: 0,
    draws: 1,
  });
  assert.deepEqual(initial, { X: 0, O: 0, draws: 0 });
});
