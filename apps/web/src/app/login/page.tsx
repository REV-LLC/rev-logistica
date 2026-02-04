'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { api, ApiError } from '@/lib/api';
import { getToken, isTokenExpired, setToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = searchParams.get('reason');

  useEffect(() => {
    const token = getToken();
    if (token && !isTokenExpired(token)) {
      router.replace('/inventory/warehouse');
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        auth: false,
        json: { email, password }
      });
      if (!data?.accessToken) {
        throw new Error('Respuesta inválida del servidor.');
      }
      setToken(data.accessToken);
      const next = searchParams.get('next');
      router.replace(next || '/inventory/warehouse');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <Container size="xs" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2} mb={4}>
            Ingreso
          </Title>
          <Text c="dimmed" mb="md">
            Accede con tu correo y contraseña.
          </Text>
          <Stack gap="sm" component="form" onSubmit={handleSubmit}>
            {reason === 'expired' && (
              <Text c="red" fw={600}>
                Tu sesión expiró. Inicia sesión nuevamente.
              </Text>
            )}
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@empresa.com"
              required
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
            {error && <Text c="red">{error}</Text>}
            <Button type="submit" loading={loading}>
              Entrar
            </Button>
          </Stack>
        </Paper>
      </Container>
    </main>
  );
}
