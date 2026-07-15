function csrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const row = document.cookie.split('; ').find((item) => item.startsWith('nexstream_csrf='));
  return row ? decodeURIComponent(row.split('=').slice(1).join('=')) : null;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = csrfToken();
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 401 && retry && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshed = await request<{ user: unknown }>('/auth/refresh', { method: 'POST' }, false).catch(
      () => null,
    );
    if (refreshed) return request<T>(path, init, false);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string; code?: string } }
      | null;
    throw new Error(payload?.error?.message ?? 'Não foi possível concluir a solicitação.');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
