import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";

import { createApp } from "../server/app.js";
import { createTodoStore } from "../server/db.js";

function createTempDbPath(name) {
  return path.join(os.tmpdir(), `react-todo-api-db-${process.pid}-${Date.now()}-${name}.sqlite`);
}

test("GET /api/todos returns an empty list for a new database", async () => {
  const dbPath = createTempDbPath("empty");
  const store = createTodoStore({ dbPath });
  const app = createApp({ store });

  const response = await request(app).get("/api/todos");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);

  store.close();
  fs.rmSync(dbPath, { force: true });
});

test("POST /api/todos creates a todo and rejects blank titles", async () => {
  const dbPath = createTempDbPath("create");
  const store = createTodoStore({ dbPath });
  const app = createApp({ store });

  const invalid = await request(app).post("/api/todos").send({ title: "   " });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /title/i);

  const created = await request(app).post("/api/todos").send({ title: "Buy milk" });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, "Buy milk");
  assert.equal(created.body.completed, false);
  assert.ok(created.body.id);
  assert.ok(created.body.createdAt);
  assert.ok(created.body.updatedAt);

  const listed = await request(app).get("/api/todos");
  assert.equal(listed.body.length, 1);
  assert.equal(listed.body[0].title, "Buy milk");

  store.close();
  fs.rmSync(dbPath, { force: true });
});

test("PUT /api/todos/:id updates title and completion and DELETE removes a todo", async () => {
  const dbPath = createTempDbPath("update-delete");
  const store = createTodoStore({ dbPath });
  const app = createApp({ store });

  const created = await request(app).post("/api/todos").send({ title: "Original" });
  const todoId = created.body.id;

  const updated = await request(app)
    .put(`/api/todos/${todoId}`)
    .send({ title: "Updated", completed: true });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.title, "Updated");
  assert.equal(updated.body.completed, true);

  const deleted = await request(app).delete(`/api/todos/${todoId}`);
  assert.equal(deleted.status, 204);

  const listed = await request(app).get("/api/todos");
  assert.deepEqual(listed.body, []);

  store.close();
  fs.rmSync(dbPath, { force: true });
});

test("todos persist in a real on-disk sqlite file across store restarts", async () => {
  const dbPath = createTempDbPath("persistence");
  const firstStore = createTodoStore({ dbPath });

  const created = firstStore.createTodo({ title: "Persist me" });
  firstStore.close();

  assert.equal(fs.existsSync(dbPath), true);
  assert.match(path.extname(dbPath), /^\.(db|sqlite|sqlite3)$/);

  const secondStore = createTodoStore({ dbPath });
  const todos = secondStore.listTodos();
  assert.equal(todos.length, 1);
  assert.equal(todos[0].id, created.id);
  assert.equal(todos[0].title, "Persist me");
  secondStore.close();

  fs.rmSync(dbPath, { force: true });
});
