export async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || data.reason || 'Please try again.'); error.status = response.status; throw error; }
  return data;
}
export const dateTime = value => new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
