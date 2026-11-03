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
    if (!response.ok) {
      let detail = `The server answered with status ${response.status}.`;
      try {
        const body = await response.json();
        if (body?.detail) detail = body.detail;
      } catch {
        /* response wasn't JSON; keep the generic message */
      }
      throw new Error(detail);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Builds a request path with a query string from a plain object of parameters,
// dropping anything null or undefined so callers can pass a sparse object.
function buildQuery(path, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, value);
  }
  return `${path}?${search.toString()}`;
}

export const siteQuery = (params) => buildQuery("/api/site", params);
export const windowsQuery = (params) => buildQuery("/api/windows", params);
