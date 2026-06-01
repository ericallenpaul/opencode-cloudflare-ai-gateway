import express from "express";

function parseTodoId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeTitle(title) {
  return typeof title === "string" ? title.trim() : "";
}

export function createApp({ store }) {
  const app = express();

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/todos", (_req, res) => {
    res.json(store.listTodos());
  });

  app.post("/api/todos", (req, res) => {
    const title = normalizeTitle(req.body?.title);
    if (!title) {
      res.status(400).json({ error: "Title is required." });
      return;
    }

    const todo = store.createTodo({ title });
    res.status(201).json(todo);
  });

  app.put("/api/todos/:id", (req, res) => {
    const id = parseTodoId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Valid todo id is required." });
      return;
    }

    const payload = {};
    if ("title" in (req.body ?? {})) {
      const title = normalizeTitle(req.body.title);
      if (!title) {
        res.status(400).json({ error: "Title is required." });
        return;
      }
      payload.title = title;
    }

    if ("completed" in (req.body ?? {})) {
      if (typeof req.body.completed !== "boolean") {
        res.status(400).json({ error: "Completed must be a boolean." });
        return;
      }
      payload.completed = req.body.completed;
    }

    const todo = store.updateTodo(id, payload);
    if (!todo) {
      res.status(404).json({ error: "Todo not found." });
      return;
    }

    res.json(todo);
  });

  app.delete("/api/todos/:id", (req, res) => {
    const id = parseTodoId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Valid todo id is required." });
      return;
    }

    const deleted = store.deleteTodo(id);
    if (!deleted) {
      res.status(404).json({ error: "Todo not found." });
      return;
    }

    res.status(204).end();
  });

  return app;
}
