import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const DEFAULT_DB_PATH = 'data/todos.db';

let dbInstance = null;
let currentDbPath = null;

export function getDb(dbPath) {
  const resolvedPath = dbPath || process.env.TODO_DB_PATH || DEFAULT_DB_PATH;

  if (dbInstance && currentDbPath === resolvedPath) {
    return dbInstance;
  }

  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  // Ensure directory exists
  const dir = dirname(resolvedPath);
  mkdirSync(dir, { recursive: true });

  dbInstance = new DatabaseSync(resolvedPath);
  currentDbPath = resolvedPath;

  // Create schema
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}

export function createDb(dbPath) {
  const resolvedPath = dbPath || process.env.TODO_DB_PATH || DEFAULT_DB_PATH;
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const db = new DatabaseSync(resolvedPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  return db;
}

export function getAllTodos(db) {
  return db.prepare('SELECT * FROM todos ORDER BY id ASC').all();
}

export function getTodoById(db, id) {
  return db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
}

export function insertTodo(db, title) {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    'INSERT INTO todos (title, completed, createdAt, updatedAt) VALUES (?, 0, ?, ?)'
  );
  const result = stmt.run(title, now, now);
  return getTodoById(db, result.lastInsertRowid);
}

export function updateTodo(db, id, fields) {
  const existing = getTodoById(db, id);
  if (!existing) return null;

  const title = fields.title !== undefined ? fields.title : existing.title;
  const completed = fields.completed !== undefined ? (fields.completed ? 1 : 0) : existing.completed;
  const updatedAt = new Date().toISOString();

  db.prepare(
    'UPDATE todos SET title = ?, completed = ?, updatedAt = ? WHERE id = ?'
  ).run(title, completed, updatedAt, id);

  return getTodoById(db, id);
}

export function deleteTodo(db, id) {
  const existing = getTodoById(db, id);
  if (!existing) return false;
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  return true;
}
