'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconBuilding,
  IconMapPin,
  IconPhone,
  IconSearch,
  IconUser,
} from '@tabler/icons-react';
import OpenInMapsButton, {
  getGoogleMapsAddressUrl,
} from '@/components/worksites/OpenInMapsButton';
import { api, ApiError } from '@/lib/api';

type DriverWorksite = {
  id: string;
  alias: string | null;
  customer: { name: string };
  worksite: {
    name: string;
    address: string | null;
    contactName: string | null;
    phone: string | null;
    alternatePhone: string | null;
  };
};

function WorksiteDetails({ worksite }: { worksite: DriverWorksite }) {
  const address = worksite.worksite.address?.trim() ?? '';
  const phones = [
    ...new Set(
      [worksite.worksite.phone, worksite.worksite.alternatePhone]
        .filter((phone): phone is string => Boolean(phone?.trim()))
        .map((phone) => phone.trim()),
    ),
  ];

  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Stack gap="lg">
        <div>
          <Title order={3}>{worksite.worksite.name}</Title>
          <Text c="dimmed" size="sm">
            {worksite.alias || worksite.customer.name}
          </Text>
        </div>

        <Divider />

        <Group align="flex-start" wrap="nowrap">
          <IconMapPin size={20} color="var(--mantine-color-blue-6)" />
          <div style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Ubicación
            </Text>
            <Text style={{ overflowWrap: 'anywhere' }}>
              {address || 'Sin dirección registrada'}
            </Text>
          </div>
        </Group>

        <Group align="flex-start" wrap="nowrap">
          <IconUser size={20} color="var(--mantine-color-blue-6)" />
          <div>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Encargado en obra
            </Text>
            <Text>{worksite.worksite.contactName || 'Sin encargado registrado'}</Text>
          </div>
        </Group>

        <Group align="flex-start" wrap="nowrap">
          <IconPhone size={20} color="var(--mantine-color-blue-6)" />
          <div>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Teléfono
            </Text>
            {phones.length ? (
              <Stack gap={2}>
                {phones.map((phone) => (
                  <Text key={phone} component="a" href={`tel:${phone}`} c="blue" fw={600}>
                    {phone}
                  </Text>
                ))}
              </Stack>
            ) : (
              <Text>Sin teléfono registrado</Text>
            )}
          </div>
        </Group>

        {address ? (
          <OpenInMapsButton href={getGoogleMapsAddressUrl(address)} fullWidth />
        ) : null}
      </Stack>
    </Paper>
  );
}

export default function DriverWorksitesPage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [worksites, setWorksites] = useState<DriverWorksite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await api<DriverWorksite[]>('/worksites/driver-directory', {
          method: 'GET',
        });
        if (mounted) setWorksites(data);
      } catch (err) {
        if (!mounted) return;
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : 'No se pudieron cargar las obras.',
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredWorksites = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return worksites;
    return worksites.filter((entry) =>
      [
        entry.worksite.name,
        entry.alias,
        entry.customer.name,
        entry.worksite.address,
        entry.worksite.contactName,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es').includes(term)),
    );
  }, [search, worksites]);

  const selectedWorksite = worksites.find((entry) => entry.id === selectedId) ?? null;
  const showList = !isMobile || !selectedWorksite;

  return (
    <Container size="lg" py={{ base: 'md', sm: 'xl' }}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Obras</Title>
          <Text c="dimmed">Consulta ubicación y contacto antes de iniciar la ruta.</Text>
        </div>

        {error ? <Alert color="red">{error}</Alert> : null}

        {isMobile && selectedWorksite ? (
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => setSelectedId(null)}
            style={{ alignSelf: 'flex-start' }}
          >
            Volver a obras
          </Button>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(280px, 0.8fr) minmax(360px, 1.2fr)',
            gap: 'var(--mantine-spacing-lg)',
            alignItems: 'start',
          }}
        >
          {showList ? (
            <Paper withBorder radius="lg" p="md">
              <Stack gap="sm">
                <TextInput
                  aria-label="Buscar obra"
                  placeholder="Buscar obra, cliente o dirección"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  leftSection={<IconSearch size={16} />}
                />

                {loading ? (
                  <Group justify="center" py="xl">
                    <Loader size="sm" />
                  </Group>
                ) : (
                  <ScrollArea.Autosize mah={isMobile ? 'none' : 560}>
                    <Stack gap={0}>
                      {filteredWorksites.map((entry, index) => (
                        <div key={entry.id}>
                          {index ? <Divider /> : null}
                          <UnstyledButton
                            onClick={() => setSelectedId(entry.id)}
                            aria-label={`Ver información de ${entry.worksite.name}`}
                            aria-pressed={selectedId === entry.id}
                            style={{
                              width: '100%',
                              padding: '14px 8px',
                              borderRadius: 8,
                              background:
                                selectedId === entry.id
                                  ? 'var(--mantine-color-blue-0)'
                                  : 'transparent',
                            }}
                          >
                            <Group wrap="nowrap" align="flex-start">
                              <IconBuilding size={19} color="var(--mantine-color-blue-6)" />
                              <div style={{ minWidth: 0 }}>
                                <Text fw={700} lineClamp={1}>{entry.worksite.name}</Text>
                                <Text size="sm" c="dimmed" lineClamp={1}>
                                  {entry.alias || entry.customer.name}
                                </Text>
                              </div>
                            </Group>
                          </UnstyledButton>
                        </div>
                      ))}
                      {!filteredWorksites.length ? (
                        <Text c="dimmed" ta="center" py="xl">
                          No se encontraron obras.
                        </Text>
                      ) : null}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
              </Stack>
            </Paper>
          ) : null}

          {!isMobile || selectedWorksite ? (
            selectedWorksite ? (
              <WorksiteDetails worksite={selectedWorksite} />
            ) : (
              <Paper withBorder radius="lg" p="xl">
                <Text c="dimmed" ta="center">Selecciona una obra para ver su información.</Text>
              </Paper>
            )
          ) : null}
        </div>
      </Stack>
    </Container>
  );
}
