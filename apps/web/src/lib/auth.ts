const TOKEN_KEY = 'revlogistica.token';
const SESSION_EXPIRED_NOTICE_KEY = 'revlogistica.sessionExpiredNotice';
const LOCAL_BYPASS_PAYLOAD =
  'eyJzdWIiOiJsb2NhbC1hdXRoLWJ5cGFzcyIsImVtYWlsIjoidXNlcjFAZHVtbXkubG9jYWwiLCJyb2xlIjoiQURNSU4ifQ';
const LOCAL_BYPASS_TOKEN = `local.${LOCAL_BYPASS_PAYLOAD}.bypass`;

export function isLocalAuthBypassEnabled() {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_AUTH_BYPASS_LOCAL === 'true';
}

export type JwtPayload = {
  sub?: string;
  email?: string;
  exp?: number;
  role?: AppRole;
};

function parseJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = typeof window !== 'undefined' ? window.atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

export function getToken() {
  if (isLocalAuthBypassEnabled()) return LOCAL_BYPASS_TOKEN;
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function isTokenExpired(token: string | null) {
  if (!token) return true;
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function markSessionExpiredNotice() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, '1');
}

export function consumeSessionExpiredNotice() {
  if (typeof window === 'undefined') return false;
  const shouldShowNotice = window.sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) === '1';
  window.sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
  return shouldShowNotice;
}

export function getTokenPayload() {
  const token = getToken();
  if (!token) return null;
  return parseJwtPayload(token);
}

export type AppRole = 'ADMIN' | 'OFFICE' | 'DRIVER';

export function getCurrentUserRole(): AppRole | null {
  const payload = getTokenPayload();
  const role = payload?.role;
  if (role === 'ADMIN' || role === 'OFFICE' || role === 'DRIVER') return role;
  return null;
}

export function getCurrentUserSession(): JwtPayload | null {
  return getTokenPayload();
}
