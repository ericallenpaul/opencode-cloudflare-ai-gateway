import express from 'express';
import { getDb, getAllTodos, getTodoById, insertTodo, updateTodo, deleteTodo } from './db.js';

export function createApp(dbPath) {
  const app = express();
  app.use(express.json());

  function db() {
    return getDb(dbPath);
  }

  // GET /api/todos
  app.get('/api/todos', (req, res) => {
    try {
      const todos = getAllTodos(db());
      res.json(todos);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch todos' });
    }
  });

  // POST /api/todos
  app.post('/api/todos', (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Title is required and cannot be empty' });
      }
      const todo = insertTodo(db(), title.trim());
      res.status(201).json(todo);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create todo' });
    }
  });

  // PUT /api/todos/:id
  app.put('/api/todos/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const { title, completed } = req.body;

      if (title !== undefined) {
        if (typeof title !== 'string' || title.trim() === '') {
          return res.status(400).json({ error: 'Title cannot be empty' });
        }
      }

      const existing = getTodoById(db(), id);
      if (!existing) return res.status(404).json({ error: 'Todo not found' });

      const fields = {};
      if (title !== undefined) fields.title = title.trim();
      if (completed !== undefined) fields.completed = completed;

      const updated = updateTodo(db(), id, fields);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update todo' });
    }
  });

  // DELETE /api/todos/:id
  app.delete('/api/todos/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const deleted = deleteTodo(db(), id);
      if (!deleted) return res.status(404).json({ error: 'Todo not found' });

      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete todo' });
    }
  });

  return app;
}
