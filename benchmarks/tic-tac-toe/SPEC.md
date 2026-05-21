# Tic-Tac-Toe — acceptance criteria

What "done" looks like for this benchmark target. Used to score each tool's output objectively. Score is "PASS / PARTIAL / FAIL" per criterion plus optional notes.

## Required (must all PASS for the build to count as "complete")

| # | Criterion | How to verify |
|---|---|---|
| R1 | Single `tictactoe.html` exists, opens from disk, renders the 3×3 board | Double-click the file in Finder/Explorer or run `start tictactoe.html` (Windows) / `open tictactoe.html` (mac) — board appears |
| R2 | Two-player play works: X and O alternate, clicking a cell places the mark | Manual: play 3-4 moves, verify alternation and that you can't click an occupied cell |
| R3 | Win detection: when three in a row appears, game ends and announces the winner | Manual: complete a 3-in-a-row (any direction). Verify announcement and that further clicks don't change state. |
| R4 | Draw detection: when board fills with no winner, game ends and announces draw | Manual: fill board with no win, verify draw is called out |
| R5 | Winning line is visually highlighted | Visible difference between win-line cells and others (color, border, etc.) |
| R6 | Restart button resets the board (but keeps the score) | Manual: win/draw a game, click restart, verify clean board, scores preserved |
| R7 | Score tracker shows X wins / O wins / draws, persists across page reload | Manual: play games, reload page (Ctrl+R), scores still there |
| R8 | No external dependencies — pure inline HTML/CSS/JS, file:// URL works | Open with `file://` URL or double-click; nothing 404s in console; works offline |
| R9 | Tests exist, are runnable with one command, no npm install needed | Run the command in the README; tests execute |
| R10 | All tests pass | Output shows green / passing |

## Quality dimensions (subjective, 1-5 scale; recorded in notes.md)

These don't count for "complete" but reveal differences between tools beyond raw output:

- **Code readability** — would you accept this in code review?
- **Test coverage breadth** — does it cover edge cases (corner wins, last-move draws, alternation enforcement)?
- **UX polish** — does it look like something? hover states? clear winner announcement?
- **Defensiveness** — does it handle weird inputs (clicking outside board, double-clicks, reload mid-game)?
- **Documentation clarity** — does the README explain what's there and what's not?

## What we explicitly DON'T care about for scoring

- Visual design tastes (color choices, font choices, layout style)
- Comments density / code style preferences
- Whether the implementation matches the way *you* would have written it
- Test runner choice (node --test vs vitest vs whatever -- as long as R9 is satisfied)

## Scoring tally

Per tool, report:

- Required: X / 10 passed
- Quality 1-5 averaged across the 5 dimensions
- Plus the cost / time / token metrics

## Why no "stretch goals"

Earlier drafts of this benchmark included an optional AI-opponent stretch criterion. We dropped it because tool-to-tool variance on the stretch path (some attempt it, some skip it, some over-invest in it) was about to make the headline cost/quality comparison harder to read. A single fixed scope keeps the comparison apples-to-apples. If a future benchmark target needs to exercise harder algorithmic work, it'll get its own dedicated target rather than living as a within-target variance amplifier.
