import { useEffect, useState } from "react";

import { createTodo, deleteTodo, fetchTodos, updateTodo } from "./api.js";

export default function App() {
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTodos() {
      setLoading(true);
      setError("");

      try {
        const nextTodos = await fetchTodos();
        if (active) {
          setTodos(nextTodos);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadTodos();
    return () => {
      active = false;
    };
  }, []);

  async function handleAdd(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const created = await createTodo(title);
      setTodos((current) => [...current, created]);
      setTitle("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(todo) {
    setError("");
    try {
      const updated = await updateTodo(todo.id, { completed: !todo.completed });
      setTodos((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }

  async function handleDelete(todoId) {
    setError("");
    try {
      await deleteTodo(todoId);
      setTodos((current) => current.filter((item) => item.id !== todoId));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  function startEditing(todo) {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
    setError("");
  }

  async function handleSave(todoId) {
    setError("");
    try {
      const updated = await updateTodo(todoId, { title: editingTitle });
      setTodos((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setEditingTitle("");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Todo List</h1>
        <form onSubmit={handleAdd} style={styles.form}>
          <label htmlFor="new-todo-title">Todo title</label>
          <input
            id="new-todo-title"
            name="title"
            placeholder="Add a todo title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={styles.input}
          />
          <button type="submit" disabled={saving}>
            Add
          </button>
        </form>

        {error ? (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        ) : null}

        {loading ? <p>Loading todos...</p> : null}
        {!loading && todos.length === 0 ? <p>No todos yet.</p> : null}

        {!loading && todos.length > 0 ? (
          <ul style={styles.list}>
            {todos.map((todo) => (
              <li key={todo.id} style={styles.row}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => handleToggle(todo)}
                  />
                  <span>{todo.completed ? "Completed" : "Incomplete"}</span>
                </label>

                {editingId === todo.id ? (
                  <>
                    <input
                      aria-label={`Edit title for ${todo.title}`}
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      style={styles.input}
                    />
                    <button type="button" onClick={() => handleSave(todo.id)}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <span style={todo.completed ? styles.completedTitle : undefined}>{todo.title}</span>
                    <button type="button" onClick={() => startEditing(todo)}>
                      Edit
                    </button>
                  </>
                )}

                <button type="button" onClick={() => handleDelete(todo.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

const styles = {
  page: {
    fontFamily: "Arial, sans-serif",
    padding: "2rem",
    backgroundColor: "#f5f5f5",
    minHeight: "100vh"
  },
  card: {
    maxWidth: "720px",
    margin: "0 auto",
    backgroundColor: "#fff",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)"
  },
  form: {
    display: "grid",
    gap: "0.75rem",
    marginBottom: "1rem"
  },
  input: {
    padding: "0.65rem",
    fontSize: "1rem"
  },
  list: {
    listStyle: "none",
    padding: 0,
    display: "grid",
    gap: "0.75rem"
  },
  row: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "center",
    flexWrap: "wrap",
    border: "1px solid #ddd",
    padding: "0.75rem",
    borderRadius: "10px"
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem"
  },
  completedTitle: {
    textDecoration: "line-through",
    color: "#666"
  },
  error: {
    color: "#b42318"
  }
};
