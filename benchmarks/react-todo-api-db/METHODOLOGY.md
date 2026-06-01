# React Todo API DB Methodology

This target is a one-shot full-stack app benchmark. It is intentionally larger than `tic-tac-toe` and `markdown-editor`, but still bounded enough that a coding agent should complete it in one pass.

## What This Tests

- Frontend/API/database wiring
- Npm dependency setup
- Local server startup discipline
- SQLite persistence
- API validation
- Browser-visible error handling
- Automated test quality
- README command accuracy

## Run

Use the automated harness, but do not run it unless you intentionally want to spend tool/model tokens:

```powershell
cd benchmarks\scripts
.\benchmark-auto.ps1 -Benchmark react-todo-api-db
```

Run one tool only:

```powershell
.\benchmark-auto.ps1 -Benchmark react-todo-api-db -Tools opencode
```

## Judge Behavior

The deterministic judge:

1. Runs `npm install` in the tool output directory.
2. Starts the app with `npm start`.
3. Opens the local app in Chromium.
4. Exercises create, reload, restart, toggle, edit, delete, and validation flows.
5. Runs `npm test`.

The target allows npm dependencies. That is the point: this benchmark is meant to model a small realistic web app, not a no-dependency single-file exercise.

Because the browser flow runs before `npm test`, generated tests must be isolated from previously created app data. A passing solution should use a test database, temporary database, or setup/teardown reset so the test suite is repeatable after manual or automated app use.

## Fairness Notes

- The prompt does not prescribe Express, Vite, or a specific SQLite package. Agents may choose normal npm dependencies.
- Dependency compatibility is part of setup quality. Plain `npm install` must work without peer-dependency override flags; incompatible framework/plugin pairs count as R1 failures.
- Native SQLite packages that fail to install on current Windows Node are counted as setup failures, but note them separately in comparisons. The main purpose of this target is to compare full-stack app behavior, cost, and token use, not C++ build-tool debugging.
- The judge expects conventional scripts: `npm start` and `npm test`.
- The app must use a real SQLite database persisted to disk. A localStorage-only app is invalid even if the browser behavior appears to work across reloads.
- Browser runtime dependencies should come from local files or npm-installed packages, not CDN scripts. This keeps runs deterministic and offline-friendly.
- The benchmark should not be used to tune a specific framework stack unless the prompt is intentionally changed and that change is documented.
