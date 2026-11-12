import { randomUUID } from 'node:crypto';
import type { Asset, Vehicle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalized } from './whatsapp-report.types';
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

export function readableDescription(
  text: string | null | undefined,
  technicalCode?: string | null,
) {
  let result = text ?? '';
  if (technicalCode && technicalCode.length > 24)
    result = result.split(technicalCode).join(' ');
  return result
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '',
    )
    .replace(/\b[A-Z0-9]{2,12}-\d{8}-[A-Z0-9_\-]{20,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
export function assetLabel(
  asset: Pick<Asset, 'internalNumber' | 'brand' | 'model'> & {
    sku: { name: string };
  },
) {
  const name = clean(asset.sku.name, 120);
  const details = [asset.brand, asset.model]
    .filter(Boolean)
    .map((value) => clean(value!, 60))
    .filter((value) => !name.toLowerCase().includes(value.toLowerCase()))
    .join(' ');
  return `${name} #${asset.internalNumber}${details ? ` · ${details}` : ''}`;
}

function assetChoice(asset: Asset & { sku: { name: string } }) {
  const suffix = ` #${asset.internalNumber}`;
  return {
    reference: { type: 'ASSET' as const, id: asset.id },
    assetId: asset.id,
    vehicleId: null,
    label: assetLabel(asset),
    title: clean(asset.sku.name, Math.max(1, 24 - suffix.length)) + suffix,
    description: clean(
      [
        asset.brand,
        asset.model,
        readableDescription(asset.description, asset.publicCode),
      ]
        .filter(Boolean)
        .join(' · ') || `Equipo #${asset.internalNumber}`,
      72,
    ),
    subjectReference: `${asset.sku.name} #${asset.internalNumber}`,
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
      text: `La última máquina que usaste en este chat fue:\n${clean(recent.label, 200)}\n¿Vas a reportar esta misma máquina? También puedes escribir el nombre, marca o modelo de otra.`,
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
          { id: `equipment_other:${token}`, title: 'Buscar otra' },
          { id: `equipment_catalog:${token}`, title: 'Ver lista completa' },
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

export type EquipmentCandidate = {
  reference: EquipmentReference;
  name: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  number: number | null;
};
const synonyms: Record<string, string> = {
  retro: 'retroexcavadora',
  retros: 'retroexcavadora',
  mini: 'minicargador',
  bobcat: 'bobcat minicargador',
  volco: 'volqueta',
  cat: 'caterpillar',
};
function searchWords(text: string) {
  return normalized(text)
    .split(' ')
    .flatMap((word) => (synonyms[word] ?? word).split(' '))
    .filter(
      (word) =>
        word.length > 1 &&
        ![
          'la',
          'el',
          'los',
          'las',
          'de',
          'del',
          'un',
          'una',
          'equipo',
          'maquina',
          'vehiculo',
          'se',
          'reportar',
        ].includes(word),
    );
}
function similarity(a: string, b: string) {
  if (a.includes(b) || b.includes(a)) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = row;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length, 1);
}
export function rankEquipment(
  candidates: EquipmentCandidate[],
  reference: string,
  expanded: string[] = [],
) {
  const query = searchWords(reference.slice(0, 160));
  if (!query.length) return [];
  return candidates
    .map((item) => {
      const words = searchWords(
        [item.name, item.brand, item.model, item.description, item.number]
          .filter((value) => value !== null)
          .join(' ')
          .slice(0, 600),
      );
      let score =
        query.reduce(
          (sum, word) =>
            sum +
            Math.max(0, ...words.map((target) => similarity(word, target))),
          0,
        ) / query.length;
      for (const term of expanded.slice(0, 6)) {
        const terms = searchWords(term.slice(0, 160));
        if (terms.length)
          score = Math.max(
            score,
            terms.reduce(
              (sum, word) =>
                sum +
                Math.max(0, ...words.map((target) => similarity(word, target))),
              0,
            ) / terms.length,
          );
      }
      return { item, score };
    })
    .filter((item) => item.score >= 0.4)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.name.localeCompare(b.item.name) ||
        a.item.reference.id.localeCompare(b.item.reference.id),
    )
    .slice(0, 12)
    .map((item) => item.item);
}
export async function equipmentCandidates(
  prisma: PrismaService,
  kind: EquipmentKind,
  reference: string,
  expanded: string[] = [],
) {
  const [assets, vehicles] = await Promise.all([
    prisma.asset.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(kind === 'HOUR_METER'
          ? { sku: { chargeType: 'HOUR' as const } }
          : {}),
      },
      include: { sku: { select: { name: true } } },
      orderBy: { id: 'asc' },
      take: 1000,
    }),
    prisma.vehicle.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      take: 1000,
    }),
  ]);
  const candidates: EquipmentCandidate[] = [
    ...assets.map((asset) => ({
      reference: { type: 'ASSET' as const, id: asset.id },
      name: asset.sku.name,
      brand: asset.brand,
      model: asset.model,
      description: asset.description,
      number: asset.internalNumber,
    })),
    ...vehicles.map((vehicle) => ({
      reference: { type: 'VEHICLE' as const, id: vehicle.id },
      name: `Vehículo ${vehicle.plate}`,
      brand: vehicle.brand,
      model: vehicle.model,
      description: vehicle.type,
      number: null,
    })),
  ];
  return rankEquipment(candidates, reference, expanded);
}
export async function equipmentSearch(
  prisma: PrismaService,
  kind: EquipmentKind,
  remembered?: EquipmentReference,
  suggestions?: EquipmentReference[],
) {
  if (suggestions?.length) {
    const found = await Promise.all(
      suggestions.slice(0, 5).map((ref) => findEquipment(prisma, ref, kind)),
    );
    const choices = found.filter((item): item is NonNullable<typeof item> =>
      Boolean(item),
    );
    if (choices.length) {
      const token = randomUUID();
      const rows = choices.map((item, index) => ({
        id: `equipment:${token}:${index}`,
        title: clean(item.title, 24),
        description: item.description,
      }));
      rows.push({
        id: `equipment_other:${token}`,
        title: 'Buscar otra máquina',
        description: 'Escribir otro nombre, marca o modelo',
      });
      rows.push({
        id: `equipment_catalog:${token}`,
        title: 'Ver lista completa',
        description: 'Abrir todo el catálogo de equipos',
      });
      return {
        text: 'Encontré estas máquinas por lo que escribiste. Toca «Ver coincidencias» y elige la correcta.',
        state: {
          token,
          kind,
          choices: choices.map((item) => item.reference),
          page: 0,
          recent: false,
          suggested: true,
        },
        options: { type: 'list' as const, button: 'Ver coincidencias', rows },
      };
    }
  }
  if (remembered && (await findEquipment(prisma, remembered, kind)))
    return equipmentPicker(prisma, kind, remembered);
  const token = randomUUID();
  return {
    text: '¿Qué máquina o vehículo necesitas reportar? Escribe su nombre, marca o modelo, por ejemplo «la retro amarilla» o «el minicargador Case». No necesitas buscar por páginas. Si prefieres, puedes abrir la lista completa.',
    state: {
      token,
      kind,
      choices: [] as EquipmentReference[],
      page: 0,
      recent: false,
      search: true,
    },
    options: {
      type: 'button' as const,
      buttons: [
        { id: `equipment_catalog:${token}`, title: 'Ver lista completa' },
      ],
    },
  };
}
