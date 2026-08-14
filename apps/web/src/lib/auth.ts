const TOKEN_KEY = 'revlogistica.token';
const SESSION_EXPIRED_NOTICE_KEY = 'revlogistica.sessionExpiredNotice';
const LOCAL_BYPASS_PAYLOAD =
  'eyJzdWIiOiJsb2NhbC1hdXRoLWJ5cGFzcyIsImVtYWlsIjoidXNlcjFAZHVtbXkubG9jYWwiLCJyb2xlIjoiQURNSU4ifQ';
const LOCAL_BYPASS_TOKEN = `local.${LOCAL_BYPASS_PAYLOAD}.bypass`;

export function isLocalAuthBypassEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    (
      process.env.NEXT_PUBLIC_AUTH_BYPASS_LOCAL === 'true' ||
      process.env.NEXT_PUBLIC_LOCAL_AUTH_BYPASS === 'true'
    )
  );
}

export type JwtPayload = {
  sub?: string;
  identifier?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
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

export type AppRole = 'ADMIN' | 'OFFICE' | 'DRIVER' | 'OPERATOR';

const DEFAULT_ROUTE_BY_ROLE: Record<AppRole, string> = {
  ADMIN: '/',
  OFFICE: '/',
  DRIVER: '/transport/generate',
  OPERATOR: '/inventory/hour-meter',
};

const LIMITED_ROLE_ROUTE_PREFIXES: Partial<Record<AppRole, string[]>> = {
  DRIVER: [
    '/transport/generate',
    '/transport/requests',
    '/transport/driver-worksites',
    '/mobility-guides',
    '/inventory/provider-returns',
    '/inventory/ledger/document',
  ],
  OPERATOR: ['/inventory/hour-meter', '/fuel'],
};

function isPathWithinPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getDefaultRouteForRole(role: AppRole | null) {
  return role ? DEFAULT_ROUTE_BY_ROLE[role] : '/login';
}

export function getPostLoginDestination(requestedPath: string | null, role: AppRole | null) {
  const fallback = getDefaultRouteForRole(role);
  if (!requestedPath || !requestedPath.startsWith('/') || requestedPath.startsWith('//')) {
    return fallback;
  }

  const pathname = requestedPath.split('?')[0].split('#')[0];
  const limitedPrefixes = role ? LIMITED_ROLE_ROUTE_PREFIXES[role] : undefined;
  if (limitedPrefixes && !limitedPrefixes.some((prefix) => isPathWithinPrefix(pathname, prefix))) {
    return fallback;
  }

  return requestedPath;
}

export function getCurrentUserRole(): AppRole | null {
  if (isLocalAuthBypassEnabled()) return 'ADMIN';
  const payload = getTokenPayload();
  const role = payload?.role;
  if (role === 'ADMIN' || role === 'OFFICE' || role === 'DRIVER' || role === 'OPERATOR') return role;
  return null;
}

export function getCurrentUserSession(): JwtPayload | null {
  if (isLocalAuthBypassEnabled()) {
    return { email: 'user1@dummy.local', role: 'ADMIN' };
  }
  return getTokenPayload();
}
