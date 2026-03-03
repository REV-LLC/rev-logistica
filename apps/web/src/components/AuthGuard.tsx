'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { AppRole, clearToken, getCurrentUserRole, getToken, isTokenExpired } from '@/lib/auth';

type RouteRoleRule = {
  prefix: string;
  roles: AppRole[];
};

type AuthGuardProps = {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  routeRoleRules?: RouteRoleRule[];
};

function resolveAllowedRoles(pathname: string | null, rules: RouteRoleRule[]) {
  if (!pathname) return null;
  const matched = rules
    .filter((rule) => pathname.startsWith(rule.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return matched?.roles ?? null;
}

export default function AuthGuard({ children, allowedRoles, routeRoleRules = [] }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    setForbidden(false);
    const token = getToken();
    const expired = isTokenExpired(token);
    if (!token || expired) {
      if (expired) clearToken();
      const params = new URLSearchParams();
      if (pathname) params.set('next', pathname);
      if (expired) params.set('reason', 'expired');
      const query = params.toString();
      router.replace(query ? `/login?${query}` : '/login');
      return;
    }
    const role = getCurrentUserRole();
    const routeRoles = resolveAllowedRoles(pathname, routeRoleRules);
    const effectiveRoles = routeRoles ?? allowedRoles ?? null;
    if (effectiveRoles && (!role || !effectiveRoles.includes(role))) {
      setForbidden(true);
      setReady(true);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return (
      <main>
        <Center h="60vh">
          <Stack align="center">
            <Loader />
            <Text c="dimmed">Validando sesión...</Text>
          </Stack>
        </Center>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main>
        <Center h="60vh">
          <Stack align="center" gap="xs">
            <Text fw={700} size="xl">
              403
            </Text>
            <Text fw={600}>No tienes permisos para esta página.</Text>
            <Text c="dimmed" size="sm">
              Solicita acceso o ingresa con un rol autorizado.
            </Text>
            <Button mt="sm" variant="light" onClick={() => router.replace('/transport/solicitudes')}>
              Ir a inicio
            </Button>
          </Stack>
        </Center>
      </main>
    );
  }

  return <>{children}</>;
}
