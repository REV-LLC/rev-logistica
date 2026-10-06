import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SkuControlType } from '@prisma/client';
import { BulkKitSettingsDto, SaveBulkKitDto } from './bulk-kits.dto';
export function normalizeBulkKit(payload: SaveBulkKitDto) {
  const reference = payload.reference
    ?.trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es');
  if (!reference || reference.length > 100)
    throw new BadRequestException('Ingresa la referencia del conjunto.');
  if (!payload.entries?.length || payload.entries.length > 100)
    throw new BadRequestException('Agrega entre 1 y 100 piezas.');
  const seen = new Set<string>();
  for (const entry of payload.entries) {
    if (seen.has(entry.skuId))
      throw new BadRequestException(
        'Una pieza no puede repetirse. Ajusta su cantidad.',
      );
    if (
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > 1000000
    )
      throw new BadRequestException(
        'Las cantidades deben ser enteros positivos.',
      );
    seen.add(entry.skuId);
  }
  return reference;
}
// The stock-creation transaction uses this too: settings and stock save atomically.
export async function saveBulkKitSettings(
  tx: Prisma.TransactionClient,
  familyId: string,
  payload: BulkKitSettingsDto,
) {
  const prefix = payload.prefix?.trim().replace(/\s+/g, ' ') || null;
  if (payload.enabled && !prefix)
    throw new BadRequestException('Ingresa el texto inicial de los conjuntos.');
  if (prefix && prefix.length > 100)
    throw new BadRequestException(
      'El texto inicial no puede superar 100 caracteres.',
    );
  const family = await tx.assetFamily.findUnique({ where: { id: familyId } });
  if (!family) throw new NotFoundException('Familia no encontrada.');
  if (family.controlType !== SkuControlType.BULK)
    throw new BadRequestException(
      'Los conjuntos solo aplican a familias BULK.',
    );
  const result = await tx.assetFamily.updateMany({
    where: { id: familyId, bulkKitSettingsVersion: payload.version },
    data: {
      bulkKitsEnabled: payload.enabled,
      bulkKitPrefix: prefix ?? family.bulkKitPrefix,
      bulkKitSettingsVersion: { increment: 1 },
    },
  });
  if (!result.count)
    throw new ConflictException(
      'La configuración cambió. Recarga antes de guardar.',
    );
}
