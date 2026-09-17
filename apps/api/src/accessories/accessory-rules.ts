import { BadRequestException } from '@nestjs/common';
import {
  AccessoryKind,
  AccessoryScope,
  AccessoryMovementType,
} from '@prisma/client';

export type Compatibility = {
  familyId: string;
  scope: AccessoryScope;
  subfamilyIds: string[];
  assetIds: string[];
};
export type Equipment = {
  id: string;
  sku: { assetFamilyId: string; assetSubfamilyId: string | null };
};
export type Location = {
  warehouseId?: string;
  assetId?: string;
  customerWorksiteId?: string;
  transitDocumentId?: string;
};

export function isCompatible(rule: Compatibility, asset: Equipment) {
  if (rule.familyId !== asset.sku.assetFamilyId) return false;
  if (rule.scope === 'FAMILY') return true;
  if (rule.scope === 'SUBFAMILIES')
    return (
      !!asset.sku.assetSubfamilyId &&
      rule.subfamilyIds.includes(asset.sku.assetSubfamilyId)
    );
  return rule.assetIds.includes(asset.id);
}

export function validateScope(rule: Compatibility) {
  const valid =
    rule.scope === 'FAMILY'
      ? !rule.subfamilyIds.length && !rule.assetIds.length
      : rule.scope === 'SUBFAMILIES'
        ? !!rule.subfamilyIds.length && !rule.assetIds.length
        : !!rule.assetIds.length && !rule.subfamilyIds.length;
  if (!valid)
    throw new BadRequestException(
      'Selecciona únicamente los destinos del alcance elegido.',
    );
}

export function locationKey(location?: Location) {
  if (
    !location ||
    Boolean(location.warehouseId) === Boolean(location.assetId) ||
    (!!location.customerWorksiteId && !location.assetId) ||
    (!!location.transitDocumentId &&
      (!location.assetId || !!location.customerWorksiteId))
  ) {
    throw new BadRequestException(
      'Cada ubicación debe ser una bodega o un equipo, no ambos.',
    );
  }
  if (location.transitDocumentId)
    return `transit:${location.transitDocumentId}:asset:${location.assetId}`;
  return location.warehouseId
    ? `warehouse:${location.warehouseId}`
    : `asset:${location.assetId}${location.customerWorksiteId ? `:worksite:${location.customerWorksiteId}` : ''}`;
}

export function validateMovement(
  kind: AccessoryKind,
  type: AccessoryMovementType,
  quantity: number,
  from?: Location,
  to?: Location,
) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    quantity > 1000000 ||
    (kind === 'INDIVIDUAL' && quantity !== 1)
  ) {
    throw new BadRequestException(
      'Cantidad inválida. Un accesorio individualizado se mueve de a una unidad.',
    );
  }
  if (type === 'RECEIVE') {
    if (from || !to?.warehouseId || kind === 'INDIVIDUAL')
      throw new BadRequestException(
        'Solo puedes reponer accesorios por cantidad en una bodega.',
      );
  } else if (type === 'ASSIGN') {
    if (!from?.warehouseId || !to?.assetId)
      throw new BadRequestException(
        'La entrega debe ir de una bodega a un equipo.',
      );
  } else if (type === 'RETURN') {
    if (!from?.assetId || !to?.warehouseId)
      throw new BadRequestException(
        'La devolución debe ir de un equipo a una bodega.',
      );
  } else if (type === 'TRANSFER') {
    if (!from || !to || Boolean(from.assetId) !== Boolean(to.assetId))
      throw new BadRequestException(
        'El traslado debe ser entre bodegas o entre equipos.',
      );
  } else {
    if (!from || to)
      throw new BadRequestException(
        'El consumo o la baja solo requiere un origen.',
      );
    if (type === 'CONSUME' && kind !== 'CONSUMABLE')
      throw new BadRequestException(
        'Este accesorio no se consume. Solo los consumibles permiten consumo; para retirar un retornable o individualizado, registra una baja con su motivo.',
      );
  }
  if (from) locationKey(from);
  if (to) locationKey(to);
  if (from && to && locationKey(from) === locationKey(to))
    throw new BadRequestException(
      'El origen y el destino deben ser diferentes.',
    );
}
