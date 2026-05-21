# Tic-Tac-Toe

## Open the game

Double-click `tictactoe.html` in this directory. It is self-contained and runs from a `file://` URL with no build step, package install, or network access.

## Run the tests

Use Node.js built-in test runner:

```bash
node --test tictactoe.test.js
```

The tests read the inline production logic from `tictactoe.html` and verify win/draw detection, score persistence helpers, and the required local controls.

## Scoped in

- Two-player local play on the same device.
- X and O turns with occupied cells locked.
- Win and draw detection.
- Winning cells plus a visible winning stroke.
- Restart button that resets the board and keeps scores.
- Persistent X wins, O wins, and draws using `localStorage`.
- Inline CSS and JavaScript only.
- Command-line tests using Node.js built-ins only.

## Scoped out

- AI opponent.
- Online multiplayer.
- Score reset button.
- Build tooling, npm scripts, or third-party packages.

## Notes

The score key is `ticTacToeScores` in browser localStorage. If localStorage is unavailable, the game still plays, but scores cannot persist across reloads in that browser mode.
