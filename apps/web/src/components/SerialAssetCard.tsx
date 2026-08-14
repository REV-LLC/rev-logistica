'use client';

import { ActionIcon, Badge, Box, Button, Card, Center, Group, Menu, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconDotsVertical, IconPencil, IconPhotoOff, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
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
  registrationNumber?: string | null;
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
  if (isWorksiteView && normalized === 'OUT') return 'On site';
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
      return `Hora (min ${minimum}h)`;
    }
    return 'Hora';
  }
  if (normalized === 'DAY') {
    return 'Dia';
  }
  return '-';
}

export default function SerialAssetCard({
  item,
  href,
  isWorksiteView = false,
  display,
  actionLabel,
  actionColor,
  actionLoading = false,
  onAction,
  onDelete,
  deleteLoading = false,
  onOpen,
  statusBadge,
  additionalDetails = [],
  footer,
  compact = false,
}: {
  item: SerialAssetCardItem;
  href?: string;
  isWorksiteView?: boolean;
  display?: {
    showOwnerChip?: boolean;
    ownerChipLabel?: string;
    showSerial?: boolean;
    showCharge?: boolean;
  };
  actionLabel?: string;
  actionColor?: string;
  actionLoading?: boolean;
  onAction?: () => void;
  onDelete?: () => void;
  deleteLoading?: boolean;
  onOpen?: () => void;
  statusBadge?: { label: string; color: string };
  additionalDetails?: Array<{ label: string; value: ReactNode }>;
  footer?: ReactNode;
  compact?: boolean;
}) {
  const [brokenImage, setBrokenImage] = useState(false);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const description = getSerialDisplayName(item);
  const shouldShowOwnerChip = display?.showOwnerChip ?? isWorksiteView;
  const shouldShowSerial = display?.showSerial ?? true;
  const shouldShowCharge = display?.showCharge ?? true;
  const hasFooterContent = Boolean(onAction || footer);
  const isContentSized = isMobile || compact || !hasFooterContent;
  const ownerChipLabel = display?.ownerChipLabel ?? item.ownerWarehouseName;
  const showMenu = Boolean(href || onDelete);
  const title = href ? (
    <Text
      component={Link}
      href={href}
      fw={700}
      size={compact ? 'sm' : undefined}
      lineClamp={2}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      {description}
    </Text>
  ) : (
    <Text fw={700} size={compact ? 'sm' : undefined} lineClamp={2}>
      {description}
    </Text>
  );

  return (
    <Card
      withBorder
      padding={compact ? 'xs' : 'sm'}
      radius="md"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (onOpen && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onOpen();
        }
      }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        minHeight: isContentSized ? 'auto' : 320,
        height: hasFooterContent && !compact ? '100%' : 'auto',
        aspectRatio: isContentSized ? 'auto' : '1 / 1',
        gap: isMobile ? (compact ? '0.625rem' : '0.75rem') : 0,
        cursor: onOpen ? 'pointer' : undefined,
      }}
    >
      <Box
        style={{
          flex: isContentSized ? '0 0 auto' : '0 0 62%',
          width: '100%',
          minWidth: 0,
          height: isContentSized ? 'auto' : '62%',
          aspectRatio: isContentSized ? '16 / 9' : undefined,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid var(--mantine-color-gray-3)',
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
          <Center className="asset-card-image-placeholder">
            <Stack align="center" gap={4}>
              <IconPhotoOff size={25} stroke={1.6} aria-hidden="true" />
              <Text size="xs" c="dimmed">Sin foto</Text>
            </Stack>
          </Center>
        )}
      </Box>

      <Stack
        gap={compact ? 4 : 6}
        mt={isMobile ? 0 : compact ? 6 : 'xs'}
        justify={onAction ? 'space-between' : 'flex-start'}
        style={{ flex: '1 1 auto', minWidth: 0, minHeight: 0 }}
      >
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group align="flex-start" justify="space-between" wrap="nowrap" style={{ minWidth: 0 }}>
            <Box style={{ minWidth: 0, flex: 1 }}>
              {title}
            </Box>
            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Badge
                size={compact ? 'xs' : 'sm'}
                color={statusBadge?.color ?? getStatusColor(item.status)}
                variant="light"
              >
                {statusBadge?.label ?? getStatusLabel(item.status, isWorksiteView)}
              </Badge>
              {showMenu ? (
                <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      aria-label="Acciones del activo"
                      variant="subtle"
                      color="gray"
                      size="sm"
                    >
                      <IconDotsVertical size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {href ? (
                      <Menu.Item
                        component={Link}
                        href={href}
                        leftSection={<IconPencil size={16} />}
                      >
                        Editar
                      </Menu.Item>
                    ) : null}
                    {onDelete ? (
                      <Menu.Item
                        color="red"
                        disabled={deleteLoading}
                        leftSection={<IconTrash size={16} />}
                        onClick={onDelete}
                      >
                        {deleteLoading ? 'Eliminando...' : 'Eliminar'}
                      </Menu.Item>
                    ) : null}
                  </Menu.Dropdown>
                </Menu>
              ) : null}
            </Group>
          </Group>
          {shouldShowOwnerChip && ownerChipLabel ? (
            <Group gap={6} wrap="wrap">
              <Badge color={ownerColorById(item.ownerWarehouseId)} variant="light">
                Dueño: {ownerChipLabel}
              </Badge>
            </Group>
          ) : null}
          {shouldShowSerial ? (
            <Text size="xs" c="dimmed" lineClamp={isMobile ? 2 : 1}>
              {item.serialOrEngine ?? '-'}
            </Text>
          ) : null}
          {shouldShowCharge ? (
            <Text size="xs" c="dimmed" lineClamp={isMobile ? 2 : 1}>
              Cobro: {formatCharge(item.chargeType, item.minimumChargeHours)}
            </Text>
          ) : null}
          {additionalDetails.map((detail) => (
            <Text key={detail.label} size="xs" c="dimmed" lineClamp={isMobile ? 2 : 1}>
              {detail.label}: {detail.value}
            </Text>
          ))}
        </Stack>

        {onAction ? (
          <Button
            size="xs"
            fullWidth={isMobile}
            color={actionColor}
            loading={actionLoading}
            onClick={onAction}
          >
            {actionLabel ?? 'Agregar'}
          </Button>
        ) : null}
        {footer}
      </Stack>
    </Card>
  );
}
