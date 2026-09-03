import { Badge, Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import { IconExternalLink, IconFileText } from '@tabler/icons-react';
import Link from 'next/link';

type AssetMovement = {
  id: string;
  movementType?: string | null;
  quantity?: number | string | null;
  createdAt: string;
  effectiveAt?: string;
  warehouse?: { id: string; name?: string | null } | null;
  customerWorksite?: {
    customer?: { name?: string | null } | null;
    worksite?: { name?: string | null } | null;
  } | null;
  document?: {
    id: string;
    consecutive?: string | null;
    type?: string | null;
  } | null;
};

type AssetMovementSummaryProps = {
  movements: AssetMovement[];
  warehouseCurrentId: string | null;
  warehouseCurrentName: string;
  worksiteLocationName: string | null;
};

const MOVEMENT_LABELS: Record<string, string> = {
  IN: 'Entrada a bodega',
  OUT: 'Salida de bodega',
  ON_SITE: 'Entrega en obra',
  TRANSIT: 'En tránsito',
  ADJUST: 'Ajuste',
};

function formatMovementDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(date);
}

function movementLocation(movement: AssetMovement) {
  if (movement.customerWorksite) {
    const customer = movement.customerWorksite.customer?.name?.trim();
    const worksite = movement.customerWorksite.worksite?.name?.trim();
    return [customer, worksite].filter(Boolean).join(' / ') || 'Obra';
  }
  return movement.warehouse?.name?.trim() || 'Sin ubicación registrada';
}

export default function AssetMovementSummary({
  movements,
  warehouseCurrentId,
  warehouseCurrentName,
  worksiteLocationName,
}: AssetMovementSummaryProps) {
  const worksiteName = worksiteLocationName?.trim();
  const recentMovements = movements.slice(0, 10);
  const relatedDocuments = Array.from(
    movements.reduce((documents, movement) => {
      if (movement.document && !documents.has(movement.document.id)) {
        documents.set(movement.document.id, {
          ...movement.document,
          movementDate: movement.effectiveAt ?? movement.createdAt,
        });
      }
      return documents;
    }, new Map<string, NonNullable<AssetMovement['document']> & { movementDate: string }>()),
  ).map(([, document]) => document);

  return (
    <Paper withBorder radius="xl" p={{ base: 'md', md: 'lg' }}>
      <Stack gap="sm">
        <div>
          <Text className="ui-text-label" mb={4}>
            Movimientos recientes
          </Text>
          <Text className="ui-text-body">
            {worksiteName
              ? `Ubicación actual: ${worksiteName}.`
              : warehouseCurrentId
                ? `Ubicación actual: ${warehouseCurrentName}.`
                : 'Ubicación actual pendiente.'}
          </Text>
        </div>

        {recentMovements.length ? (
          <Stack gap={0}>
            {recentMovements.map((movement, index) => {
              const type = movement.movementType?.toUpperCase() || 'MOVEMENT';
              return (
                <div key={movement.id}>
                  {index > 0 ? <Divider my="sm" /> : null}
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Group gap="xs" mb={3} wrap="wrap">
                        <Badge size="sm" variant="light">
                          {MOVEMENT_LABELS[type] ?? type.replaceAll('_', ' ')}
                        </Badge>
                        {movement.document?.consecutive ? (
                          <Text
                            component={Link}
                            href={`/inventory/ledger/document/${movement.document.id}`}
                            size="xs"
                            fw={700}
                            c="blue"
                            style={{ textDecoration: 'none' }}
                          >
                            {movement.document.consecutive}
                          </Text>
                        ) : null}
                      </Group>
                      <Text size="sm">{movementLocation(movement)}</Text>
                    </div>
                    <Text size="xs" c="dimmed" ta="right" style={{ flexShrink: 0 }}>
                      {formatMovementDate(movement.effectiveAt ?? movement.createdAt)}
                    </Text>
                  </Group>
                </div>
              );
            })}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Este equipo todavía no tiene movimientos registrados.
          </Text>
        )}

        <Divider />

        <div>
          <Text className="ui-text-label" mb="xs">
            Documentos relacionados
          </Text>
          {relatedDocuments.length ? (
            <Stack gap="xs">
              {relatedDocuments.map((document) => {
                const typeLabel = document.type === 'RETURN'
                  ? 'Devolución'
                  : document.type === 'REMISSION'
                    ? 'Remisión'
                    : 'Documento';
                return (
                  <Group key={document.id} justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <IconFileText size={18} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={700} lineClamp={1}>
                          {typeLabel} {document.consecutive ?? ''}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Movimiento del {formatMovementDate(document.movementDate)}
                        </Text>
                      </div>
                    </Group>
                    <Button
                      component={Link}
                      href={`/inventory/ledger/document/${document.id}`}
                      variant="subtle"
                      size="compact-sm"
                      rightSection={<IconExternalLink size={14} />}
                    >
                      Abrir
                    </Button>
                  </Group>
                );
              })}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Los movimientos de este equipo no tienen documentos asociados.
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
  );
}
