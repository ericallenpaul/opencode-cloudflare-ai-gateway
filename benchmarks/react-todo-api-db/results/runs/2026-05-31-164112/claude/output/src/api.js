const BASE = '/api/todos';

export async function fetchTodos() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch todos');
  return res.json();
}

export async function createTodo(title) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create todo');
  return data;
}

export async function updateTodo(id, fields) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update todo');
  return data;
}

export async function deleteTodo(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete todo');
  }
}
