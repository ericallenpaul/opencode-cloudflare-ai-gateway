const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function openDatabase(dbPath) {
  ensureDirForFile(dbPath);
  const db = new sqlite3.Database(dbPath);

  function run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  function all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }

  function init() {
    const sql = `CREATE TABLE IF NOT EXISTS todos(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`;
    return run('PRAGMA foreign_keys = ON').then(() => run(sql));
  }

  function close() {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  return { db, run, get, all, init, close };
}

module.exports = { openDatabase };
