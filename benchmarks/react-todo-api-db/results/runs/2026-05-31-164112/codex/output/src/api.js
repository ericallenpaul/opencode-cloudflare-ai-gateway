async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

export function fetchTodos() {
  return request("/api/todos");
}

export function createTodo(title) {
  return request("/api/todos", {
    method: "POST",
    body: JSON.stringify({ title })
  });
}

export function updateTodo(id, updates) {
  return request(`/api/todos/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
}

export function deleteTodo(id) {
  return request(`/api/todos/${id}`, {
    method: "DELETE"
  });
}
