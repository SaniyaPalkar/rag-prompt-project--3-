// All calls go to /api/... and Vite's proxy forwards them to the backend on port 5000.
// Login is a cookie set by the server, so the browser attaches it automatically.

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("nf-unauthorized")); // session ended: show the login page
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const post = (url, body) =>
  fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body || {}) }).then(parse);

// ---- auth
export const register = (name, email, password) => post("/api/auth/register", { name, email, password });
export const login = (email, password) => post("/api/auth/login", { email, password });
export const logout = () => post("/api/auth/logout");
export const me = () => fetch("/api/auth/me").then(parse);

// ---- chat
export const getModels = () => fetch("/api/models").then(parse); // { provider, default, models: [{id,label}], error }
export const sendChat = ({ chatId, message, model }) => post("/api/chat", { chatId, message, model });
// resolves to { chatId, title, answer, sources, concepts }

export const getChats = () => fetch("/api/chats").then(parse);
export const getChat = (id) => fetch(`/api/chats/${id}`).then(parse);
export const updateChat = (id, body) =>
  fetch(`/api/chats/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) }).then(parse);
export const deleteChat = (id) => fetch(`/api/chats/${id}`, { method: "DELETE" }).then(parse);

// ---- library
export const getLibrary = () => fetch("/api/library").then(parse);
export const deleteDoc = (id) => fetch(`/api/library/${id}`, { method: "DELETE" }).then(parse);

export async function uploadFiles(files, lectureDate) {
  const form = new FormData();
  [...files].forEach((f) => form.append("files", f));
  if (lectureDate) form.append("lectureDate", lectureDate);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("nf-unauthorized"));
  if (!res.ok && !data.errors) throw new Error(data.error || "Upload failed");
  return data; // { documents: [...], errors: [...] }
}