const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createApp } = require('../server');
const request = require('supertest');

const TEST_DB = path.join(__dirname, '..', 'data', 'test.sqlite3');

describe('API tests', function () {
  let app; let close;

  beforeEach(async function () {
    // remove existing test db
    try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch (e) {}
    const created = await createApp(TEST_DB);
    app = created.app;
    close = created.close;
  });

  afterEach(async function () {
    if (typeof close === 'function') {
      try { await close(); } catch (e) { /* ignore double-close */ }
    }
    try { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); } catch (e) {}
  });

  it('creates, reads, updates, toggles, deletes, and persists todos', async function () {
    // start empty
    let res = await request(app).get('/api/todos').expect(200);
    assert(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 0);

    // invalid create
    await request(app).post('/api/todos').send({ title: '   ' }).expect(400);

    // create
    res = await request(app).post('/api/todos').send({ title: 'First' }).expect(201);
    const todo = res.body;
    assert.strictEqual(todo.title, 'First');
    assert.strictEqual(todo.completed, false);

    // read
    res = await request(app).get('/api/todos').expect(200);
    assert.strictEqual(res.body.length, 1);

    // update title
    const id = todo.id;
    res = await request(app).put('/api/todos/' + id).send({ title: 'First Updated' }).expect(200);
    assert.strictEqual(res.body.title, 'First Updated');

    // toggle
    res = await request(app).patch('/api/todos/' + id + '/toggle').expect(200);
    assert.strictEqual(res.body.completed, true);

    // delete
    await request(app).delete('/api/todos/' + id).expect(204);

    // create two and test persistence across app instances
    const r1 = await request(app).post('/api/todos').send({ title: 'A' }).expect(201);
    const r2 = await request(app).post('/api/todos').send({ title: 'B' }).expect(201);
    assert(r1.body.id && r2.body.id);

    // close app (closes DB)
    await close();
    close = undefined; // prevent afterEach from attempting to close again

    // create new app instance pointing at same DB
    const created2 = await createApp(TEST_DB);
    const app2 = created2.app;
    const close2 = created2.close;

    const res2 = await request(app2).get('/api/todos').expect(200);
    assert.strictEqual(res2.body.length, 2);

    await close2();
  });
});
