# benchmarks/scripts/judge

This directory contains the deterministic functional test layer for the benchmark judge.

## Contents

| File / dir | What it is |
|---|---|
| `playwright.spec.js` (or similar) | Playwright test suite implementing R1-R10 acceptance criteria for the tic-tac-toe benchmark target. Uses selector-agnostic helpers to handle differing DOMs across tools. |
| `JUDGE-PROMPT.md` | Qualitative AI prompt template. Contains placeholder tokens that `judge-run.ps1` substitutes with per-tool data before writing `judge-prompt-<tool>.md` files. Paste the pre-substituted file into any multimodal agent to get soft scores (1-5) and observations. |
| `package.json` | Local Playwright install. Run `npm install` here once, then `npx playwright install chromium`. |
| `node_modules/` | Local Playwright install (gitignored). |

## Usage

Do not invoke the Playwright tests directly. Use `judge-run.ps1` from `benchmarks/scripts/`, which sets the required environment variables, runs the suite against each tool's output, and writes all output files to the correct results paths.

See [`benchmarks/scripts/README.md`](../README.md) for the full usage flow, pre-requirements, and description of all output files.
