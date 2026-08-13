'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import OpenInMapsButton from '@/components/worksites/OpenInMapsButton';

type AddressValidationResponse = {
  inputAddress: string;
  formattedAddress: string;
  context: { department: string | null; city: string | null };
  googleContext: { department: string | null; city: string | null };
  placeId: string | null;
  location: { lat: number; lng: number } | null;
  verdict: { hasUnconfirmedComponents: boolean };
};

type WorksiteAddressFieldProps = {
  value: string;
  onChange: (value: string) => void;
  department?: string | null;
  city?: string | null;
  label?: string;
  placeholder?: string;
};

function getMapsQuery(validation: AddressValidationResponse) {
  return validation.location
    ? `${validation.location.lat},${validation.location.lng}`
    : validation.formattedAddress;
}

function getGoogleMapsSearchUrl(validation: AddressValidationResponse) {
  const params = new URLSearchParams({ api: '1', query: getMapsQuery(validation) });
  if (validation.placeId) params.set('query_place_id', validation.placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function getGoogleMapsPreviewUrl(validation: AddressValidationResponse) {
  return `https://www.google.com/maps?${new URLSearchParams({
    q: getMapsQuery(validation),
    z: '17',
    output: 'embed',
  }).toString()}`;
}

export default function WorksiteAddressField({
  value,
  onChange,
  department,
  city,
  label = 'Dirección',
  placeholder = 'Dirección o descripción de ubicación',
}: WorksiteAddressFieldProps) {
  const [validation, setValidation] = useState<AddressValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValidation(null);
    setError(null);
  }, [city, department]);

  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    setValidation(null);
    setError(null);
  };

  const validateAddress = async () => {
    const address = value.trim();
    setValidation(null);
    setError(null);
    if (!address) {
      setError('Ingresa una dirección para revisarla con Maps.');
      return;
    }

    setLoading(true);
    try {
      setValidation(
        await api<AddressValidationResponse>('/worksites/address/validate', {
          method: 'POST',
          json: {
            address,
            regionCode: 'CO',
            department: department?.trim() || undefined,
            city: city?.trim() || undefined,
          },
        }),
      );
    } catch (validationError) {
      setError(
        validationError instanceof ApiError
          ? `${validationError.status}: ${validationError.message}`
          : validationError instanceof Error
            ? validationError.message
            : 'No se pudo revisar la dirección con Maps.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="sm">
      <TextInput
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => handleChange(event.currentTarget.value)}
      />

      <Group justify="space-between" align="flex-start" gap="sm">
        <Button
          type="button"
          variant="default"
          leftSection={<IconMapPin size={16} />}
          loading={loading}
          disabled={!value.trim()}
          onClick={validateAddress}
        >
          Revisar con Maps
        </Button>
        {validation?.location ? (
          <Text size="xs" c="dimmed">
            {validation.location.lat.toFixed(6)}, {validation.location.lng.toFixed(6)}
          </Text>
        ) : null}
      </Group>

      {error ? (
        <Alert color="yellow" variant="light" title="Maps no pudo normalizar la dirección">
          {error}
        </Alert>
      ) : null}

      {validation ? (
        <Alert
          color={validation.verdict.hasUnconfirmedComponents ? 'yellow' : 'green'}
          variant="light"
          title={
            validation.verdict.hasUnconfirmedComponents
              ? 'Maps encontró una sugerencia para confirmar'
              : 'Dirección normalizada por Maps'
          }
        >
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Escrita</Text>
                <Text size="sm">{validation.inputAddress}</Text>
                {validation.context.city || validation.context.department ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    {[validation.context.city, validation.context.department, 'Colombia']
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                ) : null}
              </div>
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Sugerida por Maps</Text>
                <Text size="sm">{validation.formattedAddress}</Text>
                {validation.googleContext.city || validation.googleContext.department ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    {[validation.googleContext.city, validation.googleContext.department]
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                ) : null}
              </div>
            </SimpleGrid>

            <div
              style={{
                border: '1px solid var(--mantine-color-gray-3)',
                borderRadius: 8,
                height: 220,
                overflow: 'hidden',
                background: 'var(--mantine-color-gray-0)',
              }}
            >
              <iframe
                title="Vista previa de la ubicación"
                src={getGoogleMapsPreviewUrl(validation)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={{ border: 0, width: '100%', height: '100%' }}
              />
            </div>

            <Group justify="flex-end">
              <Button type="button" size="xs" variant="default" onClick={() => handleChange(validation.inputAddress)}>
                Conservar escrita
              </Button>
              <OpenInMapsButton href={getGoogleMapsSearchUrl(validation)} />
              <Button type="button" size="xs" variant="light" onClick={() => handleChange(validation.formattedAddress)}>
                Usar sugerida
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}
    </Stack>
  );
}
