const express = require('express');
const path = require('path');
const { openDatabase } = require('./db');

async function createApp(dbPath) {
  const database = openDatabase(dbPath || process.env.DB_PATH || path.join(__dirname, 'data', 'todos.sqlite3'));
  await database.init();

  const app = express();
  app.use(express.json());

  // API
  app.get('/api/todos', async (req, res) => {
    try {
      const rows = await database.all('SELECT * FROM todos ORDER BY id');
      const todos = rows.map(r => ({
        id: r.id,
        title: r.title,
        completed: !!r.completed,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      }));
      res.json(todos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.post('/api/todos', async (req, res) => {
    try {
      const title = (req.body.title || '').toString();
      if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
      const now = new Date().toISOString();
      const r = await database.run('INSERT INTO todos (title, completed, createdAt, updatedAt) VALUES (?, 0, ?, ?)', [title.trim(), now, now]);
      const row = await database.get('SELECT * FROM todos WHERE id = ?', [r.lastID]);
      res.status(201).json({ id: row.id, title: row.title, completed: !!row.completed, createdAt: row.createdAt, updatedAt: row.updatedAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.put('/api/todos/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const title = (req.body.title || '').toString();
      if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
      const now = new Date().toISOString();
      const r = await database.run('UPDATE todos SET title = ?, updatedAt = ? WHERE id = ?', [title.trim(), now, id]);
      if (r.changes === 0) return res.status(404).json({ error: 'not found' });
      const row = await database.get('SELECT * FROM todos WHERE id = ?', [id]);
      res.json({ id: row.id, title: row.title, completed: !!row.completed, createdAt: row.createdAt, updatedAt: row.updatedAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.patch('/api/todos/:id/toggle', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = await database.get('SELECT * FROM todos WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ error: 'not found' });
      const now = new Date().toISOString();
      const newVal = row.completed ? 0 : 1;
      await database.run('UPDATE todos SET completed = ?, updatedAt = ? WHERE id = ?', [newVal, now, id]);
      const updated = await database.get('SELECT * FROM todos WHERE id = ?', [id]);
      res.json({ id: updated.id, title: updated.title, completed: !!updated.completed, createdAt: updated.createdAt, updatedAt: updated.updatedAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.delete('/api/todos/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const r = await database.run('DELETE FROM todos WHERE id = ?', [id]);
      if (r.changes === 0) return res.status(404).json({ error: 'not found' });
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  // Static files
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.use('/public', express.static(path.join(__dirname, 'public')));

  app.get('/vendor/react.production.min.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'react', 'umd', 'react.production.min.js'));
  });

  app.get('/vendor/react-dom.production.min.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'));
  });

  return { app, close: async () => { await database.close(); } };
}

if (require.main === module) {
  (async () => {
    const port = process.env.PORT || 3000;
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'todos.sqlite3');
    const { app, close } = await createApp(dbPath);
    const server = app.listen(port, () => console.log(`Listening on http://localhost:${port}`));

    // graceful shutdown
    const shutdown = async () => {
      server.close(async () => {
        await close();
        process.exit(0);
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })();
}

module.exports = { createApp };
