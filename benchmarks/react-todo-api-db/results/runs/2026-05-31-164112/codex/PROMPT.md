# Benchmark Prompt: React Todo API DB

Build a small full-stack todo app in this directory.

Requirements:
- React frontend with a todo list UI
- Node API server
- SQLite database persisted to disk
- The SQLite database must be persisted as a visible file in the project directory or a subdirectory, with a `.db`, `.sqlite`, or `.sqlite3` extension, so the benchmark can verify that an on-disk SQLite database exists.
- The SQLite database MUST be a real on-disk file, not an in-memory engine. Do NOT use `sql.js`, in-memory SQLite, IndexedDB, `localStorage`, `sessionStorage`, or in-memory arrays — these do not satisfy persistence. After the app process stops and restarts, the database file must still exist on disk and contain the previously saved todos.
- Use a Node.js SQLite driver that writes to a real file on disk — `better-sqlite3`, `node:sqlite` (Node's built-in), or `sqlite3` are acceptable. (This is consistent with the existing guidance to prefer a package that installs cleanly on Windows without native build tools.)
- Create, read, update, complete/uncomplete, and delete todos
- Todos have at least: `id`, `title`, `completed`, `createdAt`, and `updatedAt`
- The main form must include a visible text input with an accessible label or placeholder containing `todo`, `task`, or `title`.
- The main form must include a visible submit button with accessible name `Add`, `Create`, `Save`, `New`, or `+`.
- Each todo row must have visible, accessible controls:
  - an `Edit` button that lets the user change the title and save it
  - a `Delete` button that removes the todo
  - a checkbox or visible `Complete` / `Incomplete` control for toggling completion
- Edit behavior must be straightforward in the browser UI:
  - clicking `Edit` must show a text input prefilled with the current title
  - the edit text input and `Save` or `Update` control must appear in or directly next to that todo row
  - do not reuse the main Add form as the edit UI
  - clicking `Save` or `Update` must persist the edited title
  - the updated title must appear in the list without a page reload
- Empty title submissions must be rejected by the API and shown as an error in the UI
- Data must persist after a browser reload and after the server restarts
- Include loading, empty, and error states in the UI
- Include automated tests for the API and persistence behavior.
- Tests must be isolated and repeatable. `npm test` must pass even after the app has already been started and used, so use a separate test database, a temporary database, or a reliable reset step.
- Include a README with exact install, run, and test commands

Dependency policy:
- `npm install` is allowed.
- Normal npm packages are allowed.
- Choose mutually compatible package versions that install cleanly with plain `npm install`. Do not rely on `--force`, `--legacy-peer-deps`, or peer-dependency conflicts.
- If you use Vite with `@vitejs/plugin-react`, verify the selected Vite major version is inside the plugin's published peer dependency range. A simpler plain React/esbuild setup is also fine.
- Prefer a SQLite package that installs cleanly on current Windows Node without requiring native build tools. The point of this benchmark is the full-stack app behavior and cost/tokens, not debugging local C++ compilation.
- Do not use external hosted services, SaaS databases, Docker, auth providers, network APIs, or CDN-hosted browser scripts. Runtime dependencies must come from the generated project and local npm install.
- The app must run locally from the generated files.

Keep the run bounded:
- Do not add authentication, users, projects, tags, drag-and-drop, deployment config, Docker, or styling systems unless they are already required above.
- Do not create generated planning documents.
- Do not create files outside the current benchmark workspace.
- Do not use browser automation, Playwright MCP, or manual browser smoke tests during generation; the benchmark harness will perform deterministic browser judging afterward.
- Do run the tests you create before finishing.
- Keep selectors and accessibility simple. Avoid icon-only controls unless they have clear accessible names like `Edit` and `Delete`.

Deliverables when complete:
- `package.json`
- `index.html`
- React frontend source
- Node API/server source
- SQLite schema/init code
- At least one Node test file named `*.test.js`
- `README.md`

Expected commands:
- `npm install`
- `npm test`
- `npm start`

Windows command note:
- If you run npm commands on Windows from PowerShell or Node child processes, call `npm.cmd` explicitly, for example `npm.cmd install`, `npm.cmd test`, and `npm.cmd start`.
- Do not use `Start-Process npm` or spawn `npm.ps1`; those can open the PowerShell shim as a document on some Windows setups.

The requirements above are intentionally fully specified for benchmarking purposes. Do NOT pause for clarifying questions, ambiguity exploration, or plan approval. Proceed directly to implementation, tests, and local verification.

