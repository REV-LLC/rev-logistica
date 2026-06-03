'use client';

import { Badge, Box, Button, Card, Group, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import Link from 'next/link';
import { useState } from 'react';
import { getSerialDisplayName } from '@/lib/serial-assets';
import { ownerColorById } from '@/lib/owner-color';

export type SerialAssetCardItem = {
  assetId: string;
  ownerWarehouseId?: string | null;
  serialOrEngine?: string | null;
  description?: string | null;
  skuName?: string | null;
  ownerWarehouseName?: string | null;
  imageUrl?: string | null;
  brand?: string | null;
  model?: string | null;
  chargeType?: 'DAY' | 'HOUR' | string | null;
  minimumChargeHours?: number | string | null;
  status?: 'IN' | 'OUT' | 'TRANSIT' | string | null;
  internalNumber?: string | number | null;
  imageFileObjectId?: string | null;
};

function getStatusColor(status?: string | null) {
  const normalized = status?.toUpperCase();
  if (normalized === 'IN') return 'green';
  if (normalized === 'OUT') return 'red';
  if (normalized === 'TRANSIT') return 'yellow';
  return 'gray';
}

function getStatusLabel(status?: string | null, isWorksiteView?: boolean) {
  const normalized = (status ?? 'IN').toString().toUpperCase();
  if (isWorksiteView && normalized === 'OUT') return 'En obra';
  return normalized;
}

function formatCharge(chargeType?: string | null, minimumChargeHours?: number | string | null) {
  const normalized = chargeType?.toUpperCase();
  if (normalized === 'HOUR') {
    const minimum =
      typeof minimumChargeHours === 'number'
        ? minimumChargeHours
        : typeof minimumChargeHours === 'string'
          ? Number(minimumChargeHours)
          : null;
    if (minimum != null && Number.isFinite(minimum) && minimum > 0) {
      return `Hora (mín ${minimum}h)`;
    }
    return 'Hora';
  }
  if (normalized === 'DAY') {
    return 'Día';
  }
  return '-';
}

export default function SerialAssetCard({
  item,
  href,
  isWorksiteView = false,
  display,
  actionLabel,
  onAction,
}: {
  item: SerialAssetCardItem;
  href?: string;
  isWorksiteView?: boolean;
  display?: {
    showOwnerChip?: boolean;
    ownerChipLabel?: string;
  };
  actionLabel?: string;
  onAction?: () => void;
}) {
  const [brokenImage, setBrokenImage] = useState(false);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const description = getSerialDisplayName(item);
  const shouldShowOwnerChip = display?.showOwnerChip ?? isWorksiteView;
  const ownerChipLabel = display?.ownerChipLabel ?? item.ownerWarehouseName;
  const title = href ? (
    <Text
      component={Link}
      href={href}
      fw={700}
      lineClamp={2}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      {description}
    </Text>
  ) : (
    <Text fw={700} lineClamp={2}>
      {description}
    </Text>
  );

  return (
    <Card
      withBorder
      padding="sm"
      radius="md"
      style={{
        display: 'flex',
        flexDirection: isMobile ? 'row' : 'column',
        overflow: 'hidden',
        minHeight: isMobile ? 160 : 320,
        height: '100%',
        aspectRatio: isMobile ? 'auto' : '1 / 1',
        gap: isMobile ? '0.75rem' : 0,
      }}
    >
      <Box
        style={{
          flex: isMobile ? '0 0 clamp(112px, 32vw, 156px)' : '0 0 62%',
          width: isMobile ? 'clamp(112px, 32vw, 156px)' : '100%',
          minWidth: isMobile ? 'clamp(112px, 32vw, 156px)' : undefined,
          height: isMobile ? 'auto' : '62%',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: isMobile ? 'none' : '1px solid var(--mantine-color-gray-3)',
          borderRight: isMobile ? '1px solid var(--mantine-color-gray-3)' : 'none',
          borderRadius: isMobile ? 'calc(var(--mantine-radius-md) - 2px)' : 0,
          overflow: 'hidden',
        }}
      >
        {item.imageUrl && !brokenImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={description}
            onError={() => setBrokenImage(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#ffffff' }}
          />
        ) : (
          <Text size="sm" c="dimmed" ta="center" px="sm">
            {item.imageFileObjectId ? 'Imagen cargada' : 'Sin imagen'}
          </Text>
        )}
      </Box>

      <Stack
        gap={6}
        mt={isMobile ? 0 : 'xs'}
        justify={onAction ? 'space-between' : 'flex-start'}
        style={{ flex: '1 1 auto', minWidth: 0, minHeight: 0 }}
      >
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group align="flex-start" justify="space-between" wrap="nowrap" style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
              {title}
            </Group>
            <Badge color={getStatusColor(item.status)} variant="light" style={{ flexShrink: 0 }}>
              {getStatusLabel(item.status, isWorksiteView)}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            #{item.internalNumber ?? '-'}
          </Text>
          {shouldShowOwnerChip && ownerChipLabel ? (
            <Group gap={6} wrap="wrap">
              <Badge color={ownerColorById(item.ownerWarehouseId)} variant="light">
                Dueño: {ownerChipLabel}
              </Badge>
            </Group>
          ) : null}
          <Text size="xs" c="dimmed" lineClamp={isMobile ? 2 : 1}>
            {item.serialOrEngine ?? '-'}
          </Text>
          <Text size="xs" c="dimmed" lineClamp={isMobile ? 2 : 1}>
            Cobro: {formatCharge(item.chargeType, item.minimumChargeHours)}
          </Text>
        </Stack>

        {onAction ? (
          <Button size="xs" fullWidth={isMobile} onClick={onAction}>
            {actionLabel ?? 'Agregar'}
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
