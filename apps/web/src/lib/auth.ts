const TOKEN_KEY = 'revlogistica.token';

type JwtPayload = {
  exp?: number;
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
