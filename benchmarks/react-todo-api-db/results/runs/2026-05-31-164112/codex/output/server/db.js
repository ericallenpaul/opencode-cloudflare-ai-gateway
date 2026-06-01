import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function normalizeTodo(row) {
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createTodoStore({ dbPath }) {
  const resolvedPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new DatabaseSync(resolvedPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const listStatement = db.prepare(`
    SELECT id, title, completed, created_at, updated_at
    FROM todos
    ORDER BY created_at ASC, id ASC
  `);
  const getStatement = db.prepare(`
    SELECT id, title, completed, created_at, updated_at
    FROM todos
    WHERE id = ?
  `);
  const insertStatement = db.prepare(`
    INSERT INTO todos (title, completed, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  const updateStatement = db.prepare(`
    UPDATE todos
    SET title = ?, completed = ?, updated_at = ?
    WHERE id = ?
  `);
  const deleteStatement = db.prepare(`
    DELETE FROM todos
    WHERE id = ?
  `);

  return {
    listTodos() {
      return listStatement.all().map(normalizeTodo);
    },
    getTodo(id) {
      const row = getStatement.get(id);
      return row ? normalizeTodo(row) : null;
    },
    createTodo({ title }) {
      const now = new Date().toISOString();
      const result = insertStatement.run(title, 0, now, now);
      return this.getTodo(result.lastInsertRowid);
    },
    updateTodo(id, { title, completed }) {
      const existing = this.getTodo(id);
      if (!existing) {
        return null;
      }

      const nextTitle = title ?? existing.title;
      const nextCompleted = typeof completed === "boolean" ? completed : existing.completed;
      updateStatement.run(nextTitle, nextCompleted ? 1 : 0, new Date().toISOString(), id);
      return this.getTodo(id);
    },
    deleteTodo(id) {
      const result = deleteStatement.run(id);
      return result.changes > 0;
    },
    close() {
      db.close();
    }
  };
}
