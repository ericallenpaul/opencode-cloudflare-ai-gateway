// Frontend using React UMD (no JSX)
(function () {
  const e = React.createElement;
  const { useState, useEffect } = React;

  function api(path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts)).then(async res => {
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (err) { body = text; }
      if (!res.ok) throw { status: res.status, body };
      return body;
    });
  }

  function TodoApp() {
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [title, setTitle] = useState('');

    function load() {
      setLoading(true); setError(null);
      api('/api/todos', { method: 'GET' })
        .then(data => setTodos(data))
        .catch(err => setError(err.body || 'Error'))
        .finally(() => setLoading(false));
    }

    useEffect(() => { load(); }, []);

    function addTodo(eve) {
      eve && eve.preventDefault();
      setError(null);
      api('/api/todos', { method: 'POST', body: JSON.stringify({ title }) })
        .then(t => { setTitle(''); setTodos(prev => prev.concat(t)); })
        .catch(err => setError(err.body || 'Error'));
    }

    function updateTodo(id, newTitle) {
      setError(null);
      api('/api/todos/' + id, { method: 'PUT', body: JSON.stringify({ title: newTitle }) })
        .then(updated => setTodos(prev => prev.map(p => p.id === updated.id ? updated : p)))
        .catch(err => setError(err.body || 'Error'));
    }

    function toggleTodo(id) {
      setError(null);
      api('/api/todos/' + id + '/toggle', { method: 'PATCH' })
        .then(updated => setTodos(prev => prev.map(p => p.id === updated.id ? updated : p)))
        .catch(err => setError(err.body || 'Error'));
    }

    function deleteTodo(id) {
      setError(null);
      api('/api/todos/' + id, { method: 'DELETE' })
        .then(() => setTodos(prev => prev.filter(p => p.id !== id)))
        .catch(err => setError(err.body || 'Error'));
    }

    return e('div', { style: { maxWidth: 600, margin: '20px auto', fontFamily: 'sans-serif' } },
      e('h2', null, 'Todos'),
      e('form', { onSubmit: addTodo, style: { marginBottom: 12 } },
        e('input', { placeholder: 'Enter todo title', value: title, onChange: (e) => setTitle(e.target.value), 'aria-label': 'todo title', style: { width: '70%', padding: 8 } }),
        e('button', { type: 'submit', style: { marginLeft: 8, padding: '8px 12px' } }, 'Add')
      ),
      loading && e('div', null, 'Loading...'),
      error && e('div', { style: { color: 'red', marginBottom: 8 } }, typeof error === 'string' ? error : JSON.stringify(error)),
      !loading && todos.length === 0 && e('div', null, 'No todos yet'),
      e('ul', null, todos.map(todo => e(TodoItem, { key: todo.id, todo, onToggle: toggleTodo, onDelete: deleteTodo, onSave: updateTodo })))
    );
  }

  function TodoItem({ todo, onToggle, onDelete, onSave }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(todo.title);

    useEffect(() => { setDraft(todo.title); }, [todo.title]);

    return e('li', { style: { display: 'flex', alignItems: 'center', padding: '6px 0' } },
      e('input', { type: 'checkbox', checked: todo.completed, onChange: () => onToggle(todo.id) }),
      editing ? e('input', { value: draft, onChange: (e) => setDraft(e.target.value), style: { marginLeft: 8, flex: 1, padding: 6 } }) : e('span', { style: { marginLeft: 8, flex: 1, textDecoration: todo.completed ? 'line-through' : 'none' } }, todo.title),
      editing ? e('button', { onClick: () => { onSave(todo.id, draft); setEditing(false); }, style: { marginLeft: 8 } }, 'Save') : e('button', { onClick: () => setEditing(true), style: { marginLeft: 8 } }, 'Edit'),
      e('button', { onClick: () => onDelete(todo.id), style: { marginLeft: 8 } }, 'Delete')
    );
  }

  ReactDOM.render(e(TodoApp), document.getElementById('root'));
})();
