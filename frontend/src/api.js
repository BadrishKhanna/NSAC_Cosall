// Where the API lives. Local development uses the local server; a production build reads
// VITE_API_URL from frontend/.env.production.
const raw = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const API_URL = raw.replace(/\/+$/, "");
export const IS_LOCAL_API = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_URL);

export async function getJSON(path, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`The server answered with status ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
