import { useState, useEffect, useCallback } from 'react';
import { fetchTodos, createTodo, updateTodo, deleteTodo } from './api.js';
import './styles.css';

export default function App() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addTitle, setAddTitle] = useState('');
  const [addError, setAddError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const loadTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTodos();
      setTodos(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodos();
  }, [loadTodos]);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError(null);
    try {
      const todo = await createTodo(addTitle);
      setTodos((prev) => [...prev, todo]);
      setAddTitle('');
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function handleToggle(todo) {
    try {
      const updated = await updateTodo(todo.id, { completed: !todo.completed });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleEditStart(todo) {
    setEditingId(todo.id);
    setEditTitle(todo.title);
  }

  async function handleEditSave(id) {
    try {
      const updated = await updateTodo(id, { title: editTitle });
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingId(null);
      setEditTitle('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main>
      <h1>Todo App</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <label htmlFor="new-todo-title" style={{ display: 'none' }}>
          title
        </label>
        <input
          id="new-todo-title"
          type="text"
          placeholder="Enter todo title"
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
          aria-label="title"
        />
        <button type="submit">Add</button>
      </form>

      {addError && <p className="error-msg">{addError}</p>}

      {loading && <p className="status-msg">Loading...</p>}
      {error && <p className="error-msg">{error}</p>}

      {!loading && !error && todos.length === 0 && (
        <p className="status-msg">No todos yet</p>
      )}

      <ul className="todo-list">
        {todos.map((todo) => (
          <li key={todo.id} className={`todo-item${todo.completed ? ' completed' : ''}`}>
            <input
              type="checkbox"
              checked={!!todo.completed}
              onChange={() => handleToggle(todo)}
              aria-label={`Mark "${todo.title}" as ${todo.completed ? 'incomplete' : 'complete'}`}
            />

            {editingId === todo.id ? (
              <div className="edit-form">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  aria-label="Edit todo title"
                />
                <button type="button" onClick={() => handleEditSave(todo.id)}>
                  Save
                </button>
              </div>
            ) : (
              <>
                <span className="todo-title">{todo.title}</span>
                <button type="button" onClick={() => handleEditStart(todo)}>
                  Edit
                </button>
              </>
            )}

            <button
              type="button"
              className="delete-btn"
              onClick={() => handleDelete(todo.id)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
