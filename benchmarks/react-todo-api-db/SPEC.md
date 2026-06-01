# React Todo API DB Spec

What "done" looks like for this benchmark target. The deterministic judge scores R1-R10.

| ID | Requirement | How it is checked |
|---|---|---|
| R1 | Project has a runnable npm app | `package.json`, `index.html`, installable dependencies, and a start script are present |
| R2 | App boots in a browser | Judge runs `npm install`, starts the app, opens it in Chromium, and finds a usable todo UI |
| R3 | Todos can be created through the UI | Enter a title, submit it, and the todo appears without page reload |
| R4 | Todos persist across browser reload | Create a todo, reload the page, and verify it is still visible |
| R5 | Todos persist across server restart | Create a todo, stop and restart the app, and verify it is still visible |
| R6 | Complete/uncomplete works | Toggle a todo complete and incomplete; the UI reflects both states |
| R7 | Edit works | Change a todo title through a row-local UI and verify the updated title is shown |
| R8 | Delete works | Delete a todo and verify it disappears and stays gone after reload |
| R9 | Validation and error handling work | Empty titles are rejected by the API and surfaced in the UI |
| R10 | Automated tests pass | `npm test` exits 0 |

## Functional Expectations

- The app must use a real SQLite database persisted to disk. Browser-only storage such as `localStorage`, `sessionStorage`, or in-memory arrays alone does not satisfy persistence.
- The SQLite database must be persisted as a visible file in the project directory or a subdirectory, with a `.db`, `.sqlite`, or `.sqlite3` extension. R5 is only a full pass when restart persistence works and the judge can find that database file.
- The API must expose real HTTP endpoints used by the frontend. A frontend-only mock is not enough.
- The UI should be understandable without special instructions: a visible todo/title/task input, add button, list of todos, complete toggle, visible `Edit` button, visible `Delete` button, and visible error area are sufficient.
- Each todo's edit behavior must be reachable from the browser UI. API-only update support does not satisfy R7.
- Editing must be local to the todo being edited: after clicking `Edit`, the edit input and `Save` or `Update` control should appear in or directly next to that row. Reusing the main Add form as the edit UI is not enough for full credit.
- Keep accessible names direct. The deterministic judge looks for normal text inputs and buttons named like `Add`, `Edit`, `Save`, and `Delete`.
- The app should use one local command for normal operation: `npm start`.
- The test command should be `npm test`.
- Automated tests must be isolated and repeatable. `npm test` must pass even after the app has already been run and browser-tested, so tests should use a separate test database, a temporary database, or a reliable setup/teardown reset.
- On Windows, verification commands should call `npm.cmd` explicitly from PowerShell or child processes. Do not use `Start-Process npm` or spawn `npm.ps1`.

## Allowed Implementation Choices

- Vite, plain React, or another lightweight React setup is fine.
- Express, Fastify, Hono, or Node's built-in HTTP server is fine.
- `better-sqlite3`, `sqlite3`, or another normal npm SQLite package is fine.
- Package versions must be mutually compatible under plain `npm install`. Peer-dependency conflicts are R1 setup failures, not warnings to bypass with `--force` or `--legacy-peer-deps`.
- If Vite and `@vitejs/plugin-react` are used together, their major versions must satisfy the plugin's published peer dependency range.
- Prefer packages that install cleanly on current Windows Node without native build tools. A native SQLite package that fails during `npm install` counts as an R1 setup failure, but those failures should be treated as dependency-choice notes when comparing model cost/tokens.
- A single process that serves both API and built/static frontend is fine.
- A dev-server-plus-API setup is fine if `npm start` starts everything needed for the browser judge.
- Runtime browser dependencies must be served locally from the generated project or bundled from npm-installed packages. CDN-hosted React, Babel, or other browser scripts are out of scope.

## Out Of Scope

- Authentication
- Multi-user ownership
- Remote databases
- CDN-hosted runtime scripts
- Docker
- Deployment
- Drag-and-drop
- Realtime collaboration
- Complex design systems

## Quality Dimensions

The qualitative judge can additionally score:

- Clear project structure
- Simple API design
- Defensive validation and error responses
- Minimal dependency choices
- Readable React state management
- Useful tests
- README accuracy
