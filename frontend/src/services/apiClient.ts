/**
 * Low-level HTTP client. The only place that knows about fetch, base URLs,
 * auth headers and error envelopes — every service builds on this.
 */
/**
 * API base URL. In production, set VITE_API_URL to the backend origin
 * (e.g. https://flowguard-api.onrender.com). Empty in dev so requests hit
 * `/api` and are proxied to the local backend by Vite.
 */
const API_ROOT = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const BASE_URL = `${API_ROOT}/api`;
const TOKEN_KEY = 'flowguard.token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY),
  /** `remember` → persist across browser restarts (localStorage); otherwise the
   *  session ends when the tab closes (sessionStorage). */
  set: (token: string, remember = true) => {
    if (remember) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the API running?');
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),
};
