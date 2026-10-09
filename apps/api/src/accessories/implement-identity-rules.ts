import { ConflictException } from '@nestjs/common';

export type LegacyImplementIdentity = {
  implementBridge?: { assetId: string | null; skuId?: string | null } | null;
};

/** The old identity remains readable, but its stock can only operate through Asset. */
export function assertLegacyImplementWritable(item: LegacyImplementIdentity) {
  if (!item.implementBridge) return;
  throw new ConflictException({
    code: 'IMPLEMENT_IDENTITY_PROMOTED',
    message: item.implementBridge.assetId
      ? 'Este implemento ya está registrado como equipo. Abre su ficha de inventario para editarlo o moverlo; el registro anterior conserva únicamente su historial.'
      : 'Este implemento ya está registrado por cantidad. Gestiónalo desde inventario; el registro anterior conserva únicamente su historial.',
    assetId: item.implementBridge.assetId,
    assetUrl: item.implementBridge.assetId ? `/inventory/serialized-assets/${item.implementBridge.assetId}` : null,
    skuId: item.implementBridge.skuId ?? null,
  });
}

export function legacyImplementReadMetadata(item: LegacyImplementIdentity) {
  return {
    readOnly: Boolean(item.implementBridge),
    nativeAssetId: item.implementBridge?.assetId ?? null,
    nativeAssetUrl: item.implementBridge?.assetId ? `/inventory/serialized-assets/${item.implementBridge.assetId}` : null,
  };
}
