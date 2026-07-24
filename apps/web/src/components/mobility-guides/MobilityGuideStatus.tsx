import { Badge } from '@mantine/core';

export function getMobilityGuideStatus(expiresAt?: string | null) {
  if (!expiresAt) return { label: 'Sin guia', color: 'gray' };
  const expiration = new Date(expiresAt);
  const days = Math.ceil((expiration.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: 'Expirada', color: 'red' };
  if (days <= 7) return { label: 'Por vencer', color: 'yellow' };
  return { label: 'Vigente', color: 'green' };
}

export default function MobilityGuideStatus({ expiresAt }: { expiresAt?: string | null }) {
  const status = getMobilityGuideStatus(expiresAt);
  return <Badge color={status.color} variant="light">{status.label}</Badge>;
}
