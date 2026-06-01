# React Todo API DB

Small full-stack todo app with a React frontend, Express API, and an on-disk SQLite database.

## Requirements

- Node.js 24+

## Install

```powershell
npm.cmd install
```

## Run

```powershell
npm.cmd start
```

The app starts on `http://localhost:3000` by default.

SQLite data is stored at `data/todos.sqlite` unless `TODO_DB_PATH` is set.

## Test

```powershell
npm.cmd test
```

Tests use isolated temporary SQLite files and do not depend on the main app database.
