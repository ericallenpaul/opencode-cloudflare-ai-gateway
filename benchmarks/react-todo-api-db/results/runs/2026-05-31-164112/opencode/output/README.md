# React + Node + SQLite Todo App

Simple todo app (API + UI) using Node.js (Express) and SQLite. Database file is stored at data/todos.sqlite3 by default. Tests use data/test.sqlite3 and clean it between runs.

Install dependencies:

    npm.cmd install

Start server (defaults to port 3000):

    npm.cmd start

Open the UI in a browser: http://localhost:3000/

Run tests:

    npm.cmd test

Notes:
- The server reads DB path from environment variable DB_PATH (defaults to data/todos.sqlite3).
- No external CDNs are used; React and ReactDOM are served from local node_modules via the /vendor/* routes.
- On Windows use npm.cmd to avoid PowerShell script policy issues.
