# Tic-Tac-Toe Benchmark

This directory contains a self-contained tic-tac-toe game in `tictactoe.html` and a Node.js test file in `tictactoe.test.js`.

## Open the game

Open `tictactoe.html` directly from disk by double-clicking it or opening it in a browser with a `file://` URL. No web server, build step, or package install is required.

## Run the tests

Run the unit tests with built-in Node.js only:

```bash
node --test tictactoe.test.js
```

The test harness reads the embedded script from `tictactoe.html`, evaluates it with Node's `vm` module, and asserts the exported pure game logic and score helpers.

## Scope

Included:
- Single-file HTML game with inline CSS and JavaScript
- Two-player local play on one device
- Win and draw detection with winning cells highlighted
- Restart button for the current round
- Persistent scoreboard for X wins, O wins, and draws via `localStorage`
- Built-in Node.js unit tests for the embedded logic

Out of scope:
- Computer AI opponent
- Network or multiplayer synchronization
- Asset pipelines, npm packages, or build tooling
- Resetting the persistent scoreboard

## Anything not done

Nothing else was added beyond the benchmark requirements above.
