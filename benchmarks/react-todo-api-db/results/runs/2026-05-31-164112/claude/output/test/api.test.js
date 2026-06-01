import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import supertest from 'supertest';
import { createApp } from '../server/app.js';
import { getDb, closeDb } from '../server/db.js';

const DB_PATH = join(tmpdir(), `todo-api-test-${Date.now()}.db`);

let app;
let request;

before(() => {
  // Init DB via getDb so the singleton used by app is the same
  process.env.TODO_DB_PATH = DB_PATH;
  app = createApp(DB_PATH);
  request = supertest(app);
});

after(() => {
  closeDb();
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  delete process.env.TODO_DB_PATH;
});

beforeEach(() => {
  // Clear todos between tests
  const db = getDb(DB_PATH);
  db.prepare('DELETE FROM todos').run();
  db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('todos');
});

describe('GET /api/todos', () => {
  test('returns empty array when no todos', async () => {
    const res = await request.get('/api/todos');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test('returns all todos', async () => {
    await request.post('/api/todos').send({ title: 'First' });
    await request.post('/api/todos').send({ title: 'Second' });
    const res = await request.get('/api/todos');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].title, 'First');
    assert.equal(res.body[1].title, 'Second');
  });
});

describe('POST /api/todos', () => {
  test('creates a todo', async () => {
    const res = await request.post('/api/todos').send({ title: 'Buy milk' });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Buy milk');
    assert.equal(res.body.completed, 0);
    assert.ok(res.body.id);
    assert.ok(res.body.createdAt);
    assert.ok(res.body.updatedAt);
  });

  test('rejects empty title with 400', async () => {
    const res = await request.post('/api/todos').send({ title: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('rejects whitespace-only title with 400', async () => {
    const res = await request.post('/api/todos').send({ title: '   ' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('rejects missing title with 400', async () => {
    const res = await request.post('/api/todos').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe('PUT /api/todos/:id', () => {
  test('updates todo title', async () => {
    const create = await request.post('/api/todos').send({ title: 'Original' });
    const id = create.body.id;

    const res = await request.put(`/api/todos/${id}`).send({ title: 'Updated' });
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Updated');
    assert.equal(res.body.id, id);
  });

  test('toggles completed', async () => {
    const create = await request.post('/api/todos').send({ title: 'Task' });
    const id = create.body.id;

    const res = await request.put(`/api/todos/${id}`).send({ completed: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.completed, 1);
  });

  test('rejects empty title with 400', async () => {
    const create = await request.post('/api/todos').send({ title: 'Task' });
    const id = create.body.id;

    const res = await request.put(`/api/todos/${id}`).send({ title: '' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('returns 404 for nonexistent id', async () => {
    const res = await request.put('/api/todos/99999').send({ title: 'X' });
    assert.equal(res.status, 404);
  });

  test('bumps updatedAt on update', async () => {
    const create = await request.post('/api/todos').send({ title: 'Task' });
    const id = create.body.id;
    const originalUpdatedAt = create.body.updatedAt;

    // Small delay to ensure timestamps differ
    await new Promise((r) => setTimeout(r, 10));

    const res = await request.put(`/api/todos/${id}`).send({ title: 'Updated' });
    assert.notEqual(res.body.updatedAt, originalUpdatedAt);
  });
});

describe('DELETE /api/todos/:id', () => {
  test('deletes a todo', async () => {
    const create = await request.post('/api/todos').send({ title: 'To delete' });
    const id = create.body.id;

    const del = await request.delete(`/api/todos/${id}`);
    assert.equal(del.status, 204);

    const list = await request.get('/api/todos');
    assert.equal(list.body.length, 0);
  });

  test('returns 404 for nonexistent id', async () => {
    const res = await request.delete('/api/todos/99999');
    assert.equal(res.status, 404);
  });
});
