const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const htmlPath = path.join(__dirname, "tictactoe.html");

function loadLogic() {
  const html = fs.readFileSync(htmlPath, "utf8");
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let scriptSource = null;

  while ((match = scriptPattern.exec(html)) !== null) {
    const scriptBody = match[2];
    if (scriptBody.includes("TicTacToeLogic")) {
      scriptSource = scriptBody;
      break;
    }
  }

  if (!scriptSource) {
    throw new Error("Expected an inline script containing TicTacToeLogic in tictactoe.html");
  }

  const sandbox = {
    console,
    __storage: {},
    localStorage: null,
    document: {
      addEventListener() {},
    },
    window: {},
  };
  sandbox.localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(sandbox.__storage, key)
        ? sandbox.__storage[key]
        : null;
    },
    setItem(key, value) {
      sandbox.__storage[key] = String(value);
    },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(scriptSource, sandbox, { filename: "tictactoe.html" });

  return {
    logic: sandbox.TicTacToeLogic,
    storage: sandbox.__storage,
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("exposes evaluateBoard from the embedded HTML script", () => {
  const { logic } = loadLogic();

  assert.equal(typeof logic, "object");
  assert.equal(typeof logic.evaluateBoard, "function");
});

test("detects a horizontal win and returns the winning line", () => {
  const { logic } = loadLogic();
  const result = plain(logic.evaluateBoard(["X", "X", "X", "", "O", "", "O", "", ""]));

  assert.deepEqual(result, {
    winner: "X",
    draw: false,
    status: "win",
    winningLine: [0, 1, 2],
  });
});

test("detects a vertical win", () => {
  const { logic } = loadLogic();
  const result = plain(logic.evaluateBoard(["O", "X", "", "O", "X", "", "O", "", "X"]));

  assert.deepEqual(result, {
    winner: "O",
    draw: false,
    status: "win",
    winningLine: [0, 3, 6],
  });
});

test("detects a diagonal win", () => {
  const { logic } = loadLogic();
  const result = plain(logic.evaluateBoard(["X", "O", "", "", "X", "O", "", "", "X"]));

  assert.deepEqual(result, {
    winner: "X",
    draw: false,
    status: "win",
    winningLine: [0, 4, 8],
  });
});

test("detects a draw when the board is full with no winner", () => {
  const { logic } = loadLogic();
  const result = plain(logic.evaluateBoard(["X", "O", "X", "X", "O", "O", "O", "X", "X"]));

  assert.deepEqual(result, {
    winner: null,
    draw: true,
    status: "draw",
    winningLine: [],
  });
});

test("reports an unfinished board as in progress", () => {
  const { logic } = loadLogic();
  const result = plain(logic.evaluateBoard(["X", "O", "", "", "X", "", "", "", "O"]));

  assert.deepEqual(result, {
    winner: null,
    draw: false,
    status: "in-progress",
    winningLine: [],
  });
});

test("loads default scores when localStorage is empty", () => {
  const { logic } = loadLogic();
  const scores = plain(logic.loadScores());

  assert.deepEqual(scores, {
    X: 0,
    O: 0,
    draws: 0,
  });
});

test("increments and saves the winner score once", () => {
  const { logic } = loadLogic();
  const scores = { X: 0, O: 1, draws: 2 };
  const nextScores = plain(logic.recordOutcome(scores, { winner: "X", draw: false }));

  assert.deepEqual(nextScores, {
    X: 1,
    O: 1,
    draws: 2,
  });
});

test("increments draw count when the outcome is a draw", () => {
  const { logic } = loadLogic();
  const scores = { X: 3, O: 4, draws: 0 };
  const nextScores = plain(logic.recordOutcome(scores, { winner: null, draw: true }));

  assert.deepEqual(nextScores, {
    X: 3,
    O: 4,
    draws: 1,
  });
});

test("saves scores to localStorage and loads them on the next read", () => {
  const { logic, storage } = loadLogic();
  const scores = { X: 2, O: 1, draws: 3 };

  logic.saveScores(scores);

  assert.equal(storage["tic-tac-toe-scoreboard"], JSON.stringify(scores));
  assert.deepEqual(plain(logic.loadScores()), scores);
});
