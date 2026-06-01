# React Todo App (API + SQLite)

Full-stack todo app: React 18 frontend, Express API, SQLite via better-sqlite3.

## Install

```
npm install
```

## Run (production)

Builds the frontend then starts the server:

```
npm start
```

App available at http://localhost:3001

## Development

Start only the server (frontend served from `dist/` if built):

```
npm run dev
```

Vite dev server (with proxy to API):

```
npx vite
```

## Test

```
npm test
```

Uses Node built-in test runner (`node:test`). Tests use a separate temp SQLite DB — safe to run anytime.

## Build (frontend only)

```
npm run build
```

## Windows note

On Windows, use `npm.cmd` instead of `npm` in scripts or shell invocations:

```
npm.cmd install
npm.cmd test
npm.cmd start
```

## Stack

- Frontend: React 18 + Vite 5
- Backend: Express 4
- Database: SQLite via better-sqlite3 (on-disk, `data/todos.db`)
- Tests: node:test + supertest
