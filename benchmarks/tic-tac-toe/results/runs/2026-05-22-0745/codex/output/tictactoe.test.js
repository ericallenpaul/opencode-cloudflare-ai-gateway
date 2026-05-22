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

function loadHtml() {
  return fs.readFileSync("tictactoe.html", "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage(initialValues = {}) {
  const values = { ...initialValues };

  return {
    values,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
  };
}

test("detects an X row win with the winning line indexes", () => {
  const { getGameStatus } = loadLogic();
  const status = getGameStatus(["X", "X", "X", "", "O", "", "O", "", ""]);

  assert.deepEqual(plain(status), {
    state: "win",
    winner: "X",
    line: [0, 1, 2],
  });
});

test("detects a draw when the board is full without a winner", () => {
  const { getGameStatus } = loadLogic();
  const status = getGameStatus(["X", "O", "X", "X", "O", "O", "O", "X", "X"]);

  assert.deepEqual(plain(status), {
    state: "draw",
    winner: null,
    line: [],
  });
});

test("keeps playing when empty squares remain and no one has won", () => {
  const { getGameStatus } = loadLogic();
  const status = getGameStatus(["X", "O", "X", "", "O", "", "", "X", ""]);

  assert.deepEqual(plain(status), {
    state: "playing",
    winner: null,
    line: [],
  });
});

test("increments X wins when X wins", () => {
  const { getUpdatedScores } = loadLogic();
  const scores = getUpdatedScores(
    { x: 2, o: 3, draws: 4 },
    { state: "win", winner: "X", line: [0, 1, 2] },
  );

  assert.deepEqual(plain(scores), {
    x: 3,
    o: 3,
    draws: 4,
  });
});

test("increments O wins when O wins", () => {
  const { getUpdatedScores } = loadLogic();
  const scores = getUpdatedScores(
    { x: 2, o: 3, draws: 4 },
    { state: "win", winner: "O", line: [2, 4, 6] },
  );

  assert.deepEqual(plain(scores), {
    x: 2,
    o: 4,
    draws: 4,
  });
});

test("increments draws when the game ends in a draw", () => {
  const { getUpdatedScores } = loadLogic();
  const scores = getUpdatedScores(
    { x: 2, o: 3, draws: 4 },
    { state: "draw", winner: null, line: [] },
  );

  assert.deepEqual(plain(scores), {
    x: 2,
    o: 3,
    draws: 5,
  });
});

test("saves and loads scores from localStorage-compatible storage", () => {
  const { loadScores, saveScores } = loadLogic();
  const storage = createMemoryStorage();

  saveScores(storage, { x: 5, o: 6, draws: 7 });

  assert.equal(storage.values.ticTacToeScores, '{"x":5,"o":6,"draws":7}');
  assert.deepEqual(plain(loadScores(storage)), {
    x: 5,
    o: 6,
    draws: 7,
  });
});

test("contains the browser controls required for local play", () => {
  const html = loadHtml();

  assert.match(html, /id="game-status"/);
  assert.match(html, /id="board"/);
  assert.match(html, /data-cell-index="0"/);
  assert.match(html, /data-cell-index="8"/);
  assert.match(html, /id="score-x"/);
  assert.match(html, /id="score-o"/);
  assert.match(html, /id="score-draws"/);
  assert.match(html, /id="restart"/);
});
