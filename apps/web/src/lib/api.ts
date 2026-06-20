import { clearToken, getToken, markSessionExpiredNotice } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export type ApiOptions = RequestInit & {
  json?: unknown;
  auth?: boolean;
  redirectOnAuthError?: boolean;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  const shouldAuth = options.auth !== false;

  if (shouldAuth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let body = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body
  });

  const shouldRedirect = options.redirectOnAuthError !== false;
  if (shouldRedirect && response.status === 401 && typeof window !== 'undefined') {
    clearToken();
    markSessionExpiredNotice();
    const next = window.location.pathname || '';
    if (!window.location.pathname.startsWith('/login')) {
      const params = new URLSearchParams();
      if (next) params.set('next', next);
      params.set('reason', 'expired');
      window.location.replace(`/login?${params.toString()}`);
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (isJson && (data?.message || data?.error)) ||
      response.statusText ||
      'Request failed';
    throw new ApiError(response.status, String(message), data);
  }

  return data as T;
}
