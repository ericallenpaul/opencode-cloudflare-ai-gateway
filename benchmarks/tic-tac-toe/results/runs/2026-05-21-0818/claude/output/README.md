# Tic-Tac-Toe

A self-contained two-player tic-tac-toe game in a single HTML file, plus a Node test suite for the win/draw detection logic.

## Play

Double-click `tictactoe.html`. It opens in your browser and runs from `file://` with no server, build step, or dependencies.

- X always goes first; players alternate.
- Click any empty cell to place your mark.
- Winning three-in-a-row highlights the winning line in yellow.
- **Restart** clears the board but keeps the scoreboard.
- **Reset Scores** zeroes the persistent X/O/draw counters.
- Scores are saved to `localStorage` under the key `ttt-scores-v1` and survive page reloads, browser restarts, and tab closures (per-origin / per-file-path).

## Run the tests

```
node --test tictactoe.test.js
```

Requires Node.js (any modern version with built-in `node:test` — 18+). No `npm install`, no dependencies.

Tests cover:
- Row, column, and diagonal win detection (8 winning lines)
- Draw detection (full board, no winner)
- In-progress detection (partial board, no winner)
- Edge cases: empty board, three-nulls-in-a-row not a win, multiple winning lines, won-vs-draw precedence on full winning boards
- **Drift check:** the inline JavaScript embedded in `tictactoe.html` is extracted at test time and verified to behave identically to `tictactoe.logic.js` across multiple board configurations. This catches accidental divergence between the two copies.

## Files

| File | Purpose |
|------|---------|
| `tictactoe.html` | The game. Inline CSS + JS. Self-contained, runs from `file://`. |
| `tictactoe.logic.js` | Pure `checkWinner` and `getGameStatus` functions exported as a CommonJS module so the tests can require them. The same source is duplicated inside the `<script>` block of `tictactoe.html` (verified by the drift-check tests). |
| `tictactoe.test.js` | Node built-in test runner suite (`node:test` + `node:assert/strict`). |
| `docs/superpowers/plans/2026-05-21-tictactoe.md` | The phased implementation plan that was followed during the build. |

## Scope

### In scope
- Two-player local play (X vs O on the same device, taking turns)
- Visual win detection with the winning line highlighted
- Visual draw detection
- Restart button that resets the board (preserves scores)
- Persistent scoreboard (X wins, O wins, draws) backed by `localStorage`
- Single-file HTML deliverable, no build, no npm, no external dependencies
- Unit tests for win/draw detection runnable with one Node command (no install)

### Out of scope (not requested)
- AI opponent — local two-player only
- Network / multi-device play
- Move history / undo
- Custom player names or symbols
- Animations beyond a small "pop" on the winning cells
- Accessibility audit (basic ARIA labels included; not formally tested)
- Browser automation tests of the UI (logic is tested; UI was verified manually)

### Reset Scores button
The spec listed restart of the board but did not call for resetting scores. A "Reset Scores" button was added next to "Restart" as a small quality-of-life addition since `localStorage` scores otherwise persist forever. Remove the `<button id="reset-scores">` element and its handler if you do not want it.

## Known limitations
- `tictactoe.html` and `tictactoe.logic.js` each contain their own copy of `WINNING_LINES`, `checkWinner`, and `getGameStatus`. This duplication is deliberate — the brief requires inline JavaScript in a single HTML file and no build step. The test suite includes a drift-check that catches divergence.
- `localStorage` access is wrapped in try/catch — if a browser disables it (private mode, some `file://` configurations), the game still plays but scores will not persist.

## Workflow
Implementation followed the Superpowers workflow:
1. **writing-plans** → `docs/superpowers/plans/2026-05-21-tictactoe.md`
2. **test-driven-development** → wrote each failing test before its implementation, verified red, implemented, verified green
3. **verification-before-completion** → ran the test suite, opened the HTML, confirmed gameplay and persistence
