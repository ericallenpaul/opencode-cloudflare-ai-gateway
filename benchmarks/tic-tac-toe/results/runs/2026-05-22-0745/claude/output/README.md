# Tic-Tac-Toe

Self-contained, double-clickable HTML tic-tac-toe with a persistent scoreboard, plus Node-runnable unit tests for the win/draw logic.

## Files

- `tictactoe.html` — the entire game (inline CSS + inline JS, no external assets)
- `tictactoe.test.js` — `node --test` suite for `checkWinner` / `isDraw`
- `docs/superpowers/plans/2026-05-22-tictactoe.md` — implementation plan

## Run the game

Double-click `tictactoe.html`, or open it via `file://` in any modern browser. No server, no build step, no dependencies.

## Run the tests

```
node --test tictactoe.test.js
```

Requires Node.js (built-in `node:test`, `node:assert`, `node:vm`, `node:fs` — no npm install). Tested on Node 24, works on any Node version with the built-in test runner (≥ 18).

The test file reads `tictactoe.html`, extracts its inline `<script>`, runs it in the current realm (so returned arrays' prototypes match the test's), and exercises the pure `checkWinner` / `isDraw` functions. The HTML's DOM/`localStorage` wiring is guarded by `if (typeof document !== 'undefined')`, so it's a no-op under Node.

## Scope

### In
- Two-player local play (X vs O, alternating turns)
- Win detection for all 8 lines, with the winning trio highlighted (green pulse)
- Draw detection (board full, no winner)
- "Restart Round" button — clears the board, preserves scoreboard
- "Reset Scores" button — zeroes the scoreboard and `localStorage`
- Persistent scoreboard via `localStorage` (X wins / O wins / draws) — survives reload
- Unit tests for `checkWinner` and `isDraw` covering empty, in-progress, all 8 winning lines, full-no-winner, full-with-winner, and partial-not-a-draw cases

### Out
- No AI / single-player mode
- No online or networked play
- No undo / move history beyond the current round
- No keyboard navigation (mouse / touch only)
- No accessibility audit beyond basic ARIA labels and `aria-live` status

## Status

Everything in scope shipped. All 15 unit tests pass.
