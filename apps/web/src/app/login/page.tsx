'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Box, Button, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { api, ApiError } from '@/lib/api';
import { consumeSessionExpiredNotice, getToken, isTokenExpired, setToken } from '@/lib/auth';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpiredNotice, setShowExpiredNotice] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token && !isTokenExpired(token)) {
      router.replace('/inventory/warehouse');
      return;
    }

    const reason = searchParams.get('reason');
    if (reason === 'expired') {
      setShowExpiredNotice(consumeSessionExpiredNotice());
    }

    if (reason) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('reason');
      const query = params.toString();
      router.replace(query ? `/login?${query}` : '/login');
    }
  }, [router, searchParams]);

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
        throw new Error('Invalid server response.');
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
        setError('Unexpected error.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <Container size="xs" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Box ta="center" mb="lg">
            <img
              src="/rev-logo-clean.svg"
              alt="Rev Logistica"
              style={{ height: 64, width: 'auto', maxWidth: '100%' }}
            />
          </Box>
          <Title order={2} mb={4}>
            Sign in
          </Title>
          <Text c="dimmed" mb="md">
            Access with your email and password.
          </Text>
          <Stack gap="sm" component="form" onSubmit={handleSubmit}>
            {showExpiredNotice && (
              <Text c="red" fw={600}>
                Your session expired. Sign in again.
              </Text>
            )}
            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@company.com"
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
              Sign in
            </Button>
          </Stack>
        </Paper>
      </Container>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
