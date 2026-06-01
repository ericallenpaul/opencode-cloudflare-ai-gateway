import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import { createDb, getAllTodos, insertTodo, updateTodo, deleteTodo } from '../server/db.js';

const DB_PATH = join(tmpdir(), `todo-persist-test-${Date.now()}.db`);

after(() => {
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
});

describe('Persistence', () => {
  test('data survives close and reopen of the DB file', () => {
    // Write via first DB instance
    const db1 = createDb(DB_PATH);
    const todo = insertTodo(db1, 'Persistent task');
    assert.equal(todo.title, 'Persistent task');
    db1.close();

    // Reopen and verify data still there
    const db2 = createDb(DB_PATH);
    const todos = getAllTodos(db2);
    assert.equal(todos.length, 1);
    assert.equal(todos[0].title, 'Persistent task');
    assert.equal(todos[0].id, todo.id);
    db2.close();
  });

  test('updates and deletes persist across DB reopens', () => {
    // Create separate file for this test
    const db_path2 = join(tmpdir(), `todo-persist-test2-${Date.now()}.db`);

    const db1 = createDb(db_path2);
    const t1 = insertTodo(db1, 'Task A');
    insertTodo(db1, 'Task B');
    updateTodo(db1, t1.id, { completed: true });
    db1.close();

    const db2 = createDb(db_path2);
    const todos = getAllTodos(db2);
    assert.equal(todos.length, 2);
    const found = todos.find((t) => t.id === t1.id);
    assert.equal(found.completed, 1);

    deleteTodo(db2, t1.id);
    db2.close();

    const db3 = createDb(db_path2);
    const remaining = getAllTodos(db3);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].title, 'Task B');
    db3.close();

    if (existsSync(db_path2)) unlinkSync(db_path2);
  });

  test('createdAt and updatedAt are ISO strings', () => {
    const db = createDb(join(tmpdir(), `todo-dates-test-${Date.now()}.db`));
    const todo = insertTodo(db, 'Date check');
    assert.ok(todo.createdAt);
    assert.ok(todo.updatedAt);
    // Validate ISO format
    assert.ok(!isNaN(new Date(todo.createdAt).getTime()));
    assert.ok(!isNaN(new Date(todo.updatedAt).getTime()));
    db.close();
  });
});
