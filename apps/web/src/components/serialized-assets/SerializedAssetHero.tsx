import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title, Divider } from '@mantine/core';
import { IconEngine, IconMapPin } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export type SerializedAssetFact = {
  icon: ReactNode;
  label: string;
  value: string;
};

type SerializedAssetHeroProps = {
  active: boolean;
  description: string;
  facts: SerializedAssetFact[];
  imageUrl: string;
  location: { color: string; label: string };
};

export default function SerializedAssetHero({
  active,
  description,
  facts,
  imageUrl,
  location,
}: SerializedAssetHeroProps) {
  const accent = active ? 'teal' : 'gray';

  return (
    <Paper
      withBorder
      shadow="sm"
      radius="xl"
      p={{ base: 'md', md: 'xl' }}
      style={{
        overflow: 'hidden',
        background:
          'linear-gradient(135deg, rgba(248,250,252,0.98) 0%, rgba(255,255,255,1) 55%, rgba(236,253,245,0.65) 100%)',
      }}
    >
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="xl">
        <div
          style={{
            minHeight: 320,
            borderRadius: 'var(--mantine-radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: imageUrl.trim()
              ? 'radial-gradient(circle at 50% 40%, rgba(255,255,255,1) 0%, rgba(236,253,245,0.5) 100%)'
              : 'transparent',
          }}
        >
          {imageUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={description}
              style={{
                width: '100%',
                maxWidth: 360,
                height: 260,
                objectFit: 'contain',
                filter: 'drop-shadow(0 12px 24px rgba(15, 23, 42, 0.12))',
              }}
            />
          ) : (
            <Stack align="center" gap="xs">
              <ThemeIcon color="gray" variant="light" size={56} radius="xl">
                <IconEngine size={28} />
              </ThemeIcon>
              <Text className="ui-text-body">Sin imagen</Text>
            </Stack>
          )}
        </div>

        <Stack gap="lg" justify="center">
          <div>
            <Group gap="xs" mb="sm" wrap="wrap">
              <Badge color={accent} variant="light" radius="xl">
                {active ? 'Activo' : 'Inactivo'}
              </Badge>
              <Badge color={location.color} variant="light" radius="xl" leftSection={<IconMapPin size={14} />}>
                {location.label}
              </Badge>
            </Group>
            <Title order={2} className="ui-text-title">
              {description}
            </Title>
          </div>

          <Divider color="rgba(15, 23, 42, 0.06)" />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {facts.map((item) => (
              <Group key={item.label} gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon color={accent} variant="light" radius="xl" size={30}>
                  {item.icon}
                </ThemeIcon>
                <div style={{ minWidth: 0 }}>
                  <Text className="ui-text-label">{item.label}</Text>
                  <Text className="ui-text-body" fw={500} lineClamp={2} style={{ overflowWrap: 'anywhere' }}>
                    {item.value}
                  </Text>
                </div>
              </Group>
            ))}
          </SimpleGrid>
        </Stack>
      </SimpleGrid>
    </Paper>
  );
}