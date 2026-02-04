'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import {
  Alert,
  ActionIcon,
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from '@mantine/core';

type CostResponse = {
  distanceKm: number;
  durationSeconds: number | null;
  cost: number;
  currency: string | null;
  breakdown: {
    baseFee: number;
    ratePerKm: number;
    rawCost: number;
    minCharge: number;
    roundToNearest: number | null;
    distanceSource: string;
  };
};

type DepartmentOption = {
  value: string;
  label: string;
};

type CityOption = {
  value: string;
  label: string;
};

export default function TransportCostPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [originDepartment, setOriginDepartment] = useState<string | null>(null);
  const [originCity, setOriginCity] = useState<string | null>(null);
  const [originCities, setOriginCities] = useState<CityOption[]>([]);
  const [originAddressLine, setOriginAddressLine] = useState('');
  const [destinationDepartment, setDestinationDepartment] = useState<string | null>(null);
  const [destinationCity, setDestinationCity] = useState<string | null>(null);
  const [destinationCities, setDestinationCities] = useState<CityOption[]>([]);
  const [destinationAddressLine, setDestinationAddressLine] = useState('');

  const [ratePerKm, setRatePerKm] = useState<number | ''>(4000);
  const baseFee = 30000;
  const minCharge = 40000;
  const roundToNearest = 1000;
  const currency = 'COP';

  const [loading, setLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CostResponse | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [rateEditable, setRateEditable] = useState(false);

  const fetchDepartments = async () => {
    setLocationsLoading(true);
    setError(null);
    try {
      const response = await api<{ name: string; code: string }[]>('/locations/departments', {
        method: 'GET'
      });
      const options = response
        .map((dept) => ({ value: dept.code, label: dept.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setDepartments(options);
      const valle = options.find(
        (dept) => dept.label.toLowerCase() === 'valle del cauca'
      );
      if (valle) {
        const originValue = originDepartment ?? valle.value;
        const destinationValue = destinationDepartment ?? valle.value;
        setOriginDepartment(originValue);
        setDestinationDepartment(destinationValue);
        setOriginCity(null);
        setDestinationCity(null);
        setOriginCities([]);
        setDestinationCities([]);
        fetchCities(originValue, 'origin');
        fetchCities(destinationValue, 'destination');
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
        return;
      }
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error inesperado.');
      }
    } finally {
      setLocationsLoading(false);
    }
  };

  const fetchCities = async (stateIso2: string, target: 'origin' | 'destination') => {
    setLocationsLoading(true);
    setError(null);
    try {
      const response = await api<{ name: string }[]>(`/locations/cities?state=${stateIso2}`, {
        method: 'GET'
      });
      const options = response
        .map((city) => ({ value: city.name, label: city.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (target === 'origin') {
        setOriginCities(options);
      } else {
        setDestinationCities(options);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
        return;
      }
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error inesperado.');
      }
    } finally {
      setLocationsLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const buildPayload = () => {
    if (ratePerKm === '' || ratePerKm === undefined || ratePerKm === null) {
      setError('ratePerKm es obligatorio.');
      return null;
    }

    const payload: Record<string, unknown> = {
      ratePerKm: Number(ratePerKm)
    };

    payload.routeProvider = 'mapbox';
    payload.routeProfile = 'driving';

    if (
      !originDepartment ||
      !originCity ||
      !destinationDepartment ||
      !destinationCity ||
      !originAddressLine ||
      !destinationAddressLine
    ) {
      setError('Dirección, departamento y ciudad son obligatorios.');
      return null;
    }
    const originDepartmentName =
      departments.find((dept) => dept.value === originDepartment)?.label ?? originDepartment;
    const destinationDepartmentName =
      departments.find((dept) => dept.value === destinationDepartment)?.label ??
      destinationDepartment;

    payload.originAddress = `${originAddressLine}, ${originCity}, ${originDepartmentName}, Colombia`;
    payload.destinationAddress = `${destinationAddressLine}, ${destinationCity}, ${destinationDepartmentName}, Colombia`;

    payload.baseFee = baseFee;
    payload.minCharge = minCharge;
    payload.roundToNearest = roundToNearest;
    payload.currency = currency;

    return payload;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setUnauthorized(false);

    const payload = buildPayload();
    if (!payload) {
      setLoading(false);
      return;
    }

    try {
      const response = await api<CostResponse>('/transport-cost/estimate', {
        method: 'POST',
        json: payload
      });
      setResult(response);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUnauthorized(true);
        return;
      }
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAuth = () => {
    setAuthError(null);
    setAuthEmail('');
    setAuthPassword('');
    setAuthOpen(true);
  };

  const handleAdminAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const data = await api<{
        accessToken: string;
        user?: { role?: string };
      }>('/auth/login', {
        method: 'POST',
        auth: false,
        json: { email: authEmail, password: authPassword }
      });

      if (!data?.user?.role || data.user.role !== 'ADMIN') {
        setAuthError('Solo un administrador puede editar la tarifa.');
        setAuthPassword('');
        return;
      }

      setRateEditable(true);
      setAuthOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setAuthError(`Error ${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError('Error inesperado.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  if (unauthorized) {
    return (
      <main>
        <Container size="md" py="xl">
          <Paper shadow="sm" p="xl" radius="md" withBorder>
            <Text c="red" fw={600}>
              No autorizado.
            </Text>
            <Button mt="md" onClick={() => router.replace('/login')}>
              Ir a login
            </Button>
          </Paper>
        </Container>
      </main>
    );
  }

  return (
    <main>
      <Container size="lg" py="xl">
        <Paper shadow="sm" p="xl" radius="md" withBorder>
          <Title order={2}>Costo de Transporte</Title>
          <Text c="dimmed" mt="xs">
            Calcula el costo según la distancia real por calles con Mapbox.
          </Text>
        </Paper>

        <Stack mt="lg" gap="lg">
          <Paper shadow="sm" p="xl" radius="md" withBorder>
            <Title order={4}>Ruta</Title>
            <Stack mt="md" gap="sm">
              <Group grow>
                <Select
                  label="Origen - Departamento"
                  placeholder="Selecciona departamento"
                  data={departments}
                  value={originDepartment}
                  onChange={(value) => {
                    setOriginDepartment(value);
                    setOriginCity(null);
                    setOriginCities([]);
                    if (value) fetchCities(value, 'origin');
                  }}
                  searchable
                  disabled={locationsLoading}
                  className="select-pointer"
                />
                <Select
                  label="Origen - Ciudad"
                  placeholder="Selecciona ciudad"
                  data={originCities}
                  value={originCity}
                  onChange={setOriginCity}
                  searchable
                  disabled={!originDepartment || locationsLoading}
                  className="select-pointer"
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Origen - Dirección"
                  placeholder="Cra 47 #3A-50"
                  value={originAddressLine}
                  onChange={(e) => setOriginAddressLine(e.target.value)}
                />
              </Group>
              <Group grow>
                <Select
                  label="Destino - Departamento"
                  placeholder="Selecciona departamento"
                  data={departments}
                  value={destinationDepartment}
                  onChange={(value) => {
                    setDestinationDepartment(value);
                    setDestinationCity(null);
                    setDestinationCities([]);
                    if (value) fetchCities(value, 'destination');
                  }}
                  searchable
                  disabled={locationsLoading}
                  className="select-pointer"
                />
                <Select
                  label="Destino - Ciudad"
                  placeholder="Selecciona ciudad"
                  data={destinationCities}
                  value={destinationCity}
                  onChange={setDestinationCity}
                  searchable
                  disabled={!destinationDepartment || locationsLoading}
                  className="select-pointer"
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Destino - Dirección"
                  placeholder="Cra 22 #5A-7"
                  value={destinationAddressLine}
                  onChange={(e) => setDestinationAddressLine(e.target.value)}
                />
              </Group>
            </Stack>
          </Paper>

          <Paper shadow="sm" p="xl" radius="md" withBorder>
            <Group justify="space-between" align="flex-start">
              <Title order={4}>Tarifa</Title>
              {!rateEditable && (
                <ActionIcon
                  className="rate-edit-icon-card"
                  variant="light"
                  onClick={handleOpenAuth}
                  aria-label="Editar tarifa"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 20H21"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </ActionIcon>
              )}
            </Group>
            <Stack mt="md" gap="sm">
              <Group grow>
                <NumberInput
                  label="Tarifa por Km"
                  value={ratePerKm}
                  onChange={setRatePerKm}
                  decimalScale={2}
                  disabled={!rateEditable}
                  className={!rateEditable ? 'rate-locked' : undefined}
                />
              </Group>
              <Button onClick={handleSubmit} loading={loading || locationsLoading}>
                Calcular costo
              </Button>
            </Stack>
          </Paper>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}

          {result && (
            <Paper shadow="sm" p="xl" radius="md" withBorder>
              <Title order={4}>Resultado</Title>
              <Stack mt="md" gap="xs">
                <Text>
                  Distancia: {result.distanceKm.toFixed(2)} km ({result.breakdown.distanceSource})
                </Text>
                <Text>
                  Duración: {result.durationSeconds ? `${Math.round(result.durationSeconds / 60)} min` : 'N/A'}
                </Text>
                <Text fw={600}>
                  Costo: {result.cost.toFixed(2)} {result.currency ?? ''}
                </Text>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Container>

      <Modal
        opened={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Autenticación de administrador"
        centered
      >
        <Stack gap="sm">
          <Text c="dimmed" size="sm">
            Ingresa credenciales de admin para habilitar edición de la tarifa.
          </Text>
          <TextInput
            label="Email"
            type="email"
            value={authEmail}
            onChange={(event) => setAuthEmail(event.target.value)}
            placeholder="admin@empresa.com"
            required
          />
          <PasswordInput
            label="Password"
            value={authPassword}
            onChange={(event) => setAuthPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
          {authError && <Text c="red">{authError}</Text>}
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setAuthOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdminAuth} loading={authLoading}>
              Verificar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}
