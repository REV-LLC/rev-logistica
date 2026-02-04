'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Center, Loader, Stack, Text } from '@mantine/core';
import { clearToken, getToken, isTokenExpired } from '@/lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
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

  return <>{children}</>;
}
