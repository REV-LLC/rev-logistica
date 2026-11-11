import { randomUUID } from 'node:crypto';
import type { Asset, Vehicle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  EquipmentMenu,
  EquipmentReference,
  EquipmentReplyOptions,
} from './whatsapp-report.types';

type EquipmentKind = 'DAMAGE' | 'HOUR_METER';
const PAGE_SIZE = 8;
const clean = (value: string, limit: number) =>
  value
    .replace(/[*_~`\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);

export function equipmentReference(
  value: unknown,
): EquipmentReference | undefined {
  if (!value || typeof value !== 'object') return;
  const ref = value as EquipmentReference;
  if (
    ['ASSET', 'VEHICLE'].includes(ref.type) &&
    typeof ref.id === 'string' &&
    /^[a-f0-9-]{36}$/i.test(ref.id)
  )
    return { type: ref.type, id: ref.id };
}

function assetChoice(asset: Asset & { sku: { name: string } }) {
  const suffix = ` #${asset.internalNumber}`;
  return {
    reference: { type: 'ASSET' as const, id: asset.id },
    assetId: asset.id,
    vehicleId: null,
    label: `${asset.sku.name} #${asset.internalNumber} (${asset.publicCode})`,
    title: clean(asset.sku.name, Math.max(1, 24 - suffix.length)) + suffix,
    description: clean(
      [asset.brand, asset.model, asset.description, asset.publicCode]
        .filter(Boolean)
        .join(' · '),
      72,
    ),
    subjectReference: asset.publicCode,
  };
}
function vehicleChoice(vehicle: Vehicle) {
  return {
    reference: { type: 'VEHICLE' as const, id: vehicle.id },
    assetId: null,
    vehicleId: vehicle.id,
    label: `Vehículo ${vehicle.plate}`,
    title: clean(`Vehículo ${vehicle.plate}`, 24),
    description: clean(
      [vehicle.brand, vehicle.model, vehicle.type]
        .filter(Boolean)
        .join(' · ') || vehicle.plate,
      72,
    ),
    subjectReference: vehicle.plate,
  };
}
export async function findEquipment(
  prisma: PrismaService,
  ref: EquipmentReference,
  kind: EquipmentKind,
) {
  if (ref.type === 'ASSET') {
    const asset = await prisma.asset.findFirst({
      where: {
        id: ref.id,
        active: true,
        deletedAt: null,
        ...(kind === 'HOUR_METER'
          ? { sku: { chargeType: 'HOUR' as const } }
          : {}),
      },
      include: { sku: { select: { name: true } } },
    });
    return asset ? assetChoice(asset) : null;
  }
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: ref.id, active: true },
  });
  return vehicle ? vehicleChoice(vehicle) : null;
}

export async function equipmentPicker(
  prisma: PrismaService,
  kind: EquipmentKind,
  remembered?: EquipmentReference,
  requestedPage = 0,
): Promise<{
  text: string;
  state: EquipmentMenu;
  options?: EquipmentReplyOptions;
}> {
  const token = randomUUID();
  const recent = remembered
    ? await findEquipment(prisma, remembered, kind)
    : null;
  if (recent)
    return {
      text: `La última máquina que registraste fue:\n${clean(recent.label, 200)}\n¿Vas a reportar esta misma máquina?`,
      state: {
        token,
        kind,
        choices: [recent.reference],
        page: 0,
        recent: true,
      },
      options: {
        type: 'button',
        buttons: [
          { id: `equipment:${token}:0`, title: 'Usar esta máquina' },
          { id: `equipment_other:${token}`, title: 'Elegir otra' },
        ],
      },
    };
  const where = {
    active: true,
    deletedAt: null,
    ...(kind === 'HOUR_METER' ? { sku: { chargeType: 'HOUR' as const } } : {}),
  };
  const [assetCount, vehicleCount] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.vehicle.count({ where: { active: true } }),
  ]);
  const total = assetCount + vehicleCount;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.max(0, Math.min(Math.floor(requestedPage), pages - 1));
  const start = page * PAGE_SIZE;
  const assetTake = Math.min(PAGE_SIZE, Math.max(0, assetCount - start));
  const [assets, vehicles] = await Promise.all([
    assetTake
      ? prisma.asset.findMany({
          where,
          include: { sku: { select: { name: true } } },
          orderBy: [
            { sku: { name: 'asc' } },
            { internalNumber: 'asc' },
            { id: 'asc' },
          ],
          skip: start,
          take: assetTake,
        })
      : [],
    PAGE_SIZE > assetTake
      ? prisma.vehicle.findMany({
          where: { active: true },
          orderBy: [{ plate: 'asc' }, { id: 'asc' }],
          skip: Math.max(0, start - assetCount),
          take: PAGE_SIZE - assetTake,
        })
      : [],
  ]);
  const choices = [...assets.map(assetChoice), ...vehicles.map(vehicleChoice)];
  const rows = choices.map((item, index) => ({
    id: `equipment:${token}:${index}`,
    title: clean(item.title, 24),
    description: item.description,
  }));
  if (page > 0)
    rows.push({
      id: `equipment_page:${token}:${page - 1}`,
      title: '← Anteriores',
      description: 'Ver las máquinas anteriores',
    });
  if (page + 1 < pages)
    rows.push({
      id: `equipment_page:${token}:${page + 1}`,
      title: 'Más máquinas →',
      description: 'Ver más máquinas',
    });
  return {
    text: total
      ? `Elige la máquina${kind === 'HOUR_METER' ? ' con horómetro' : ' o vehículo'} en «Ver máquinas».\nPágina ${page + 1} de ${pages}. También puedes escribir su nombre.`
      : 'No hay equipos disponibles para este reporte. Comunícate con oficina.',
    state: {
      token,
      kind,
      choices: choices.map((c) => c.reference),
      page,
      recent: false,
    },
    options: rows.length
      ? { type: 'list', button: 'Ver máquinas', rows }
      : undefined,
  };
}
