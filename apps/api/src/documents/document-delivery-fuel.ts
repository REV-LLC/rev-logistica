import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const values = ['ELECTRICO', 'GASOLINA'];
/** The delivered configuration is independent of the equipment's catalogue label. */
export function documentDeliveryLabel(reference: string, deliveryFuel?: string | null) {
  if (!deliveryFuel || !values.includes(deliveryFuel)) return reference;
  const clean = reference.replace(/\b(?:el[eé]ctric[oa]|gasolina)\b/gi, '').replace(/\s+/g, ' ').trim();
  return `${clean} · ${deliveryFuel === 'ELECTRICO' ? 'Eléctrica' : 'Gasolina'}`;
}
type Line = { assetId?: string | null; deliveryFuel?: string | null; sourceDocumentItemId?: string | null };

/** Only delivery metadata. Never changes an Asset or attaches/moves a motor. */
export async function validateDeliveryFuel(tx: Prisma.TransactionClient, document: { type: string; items: Line[] }) {
  if (document.items.some(item => item.deliveryFuel && !values.includes(item.deliveryFuel)))
    throw new BadRequestException('Selecciona eléctrica o gasolina para esta entrega.');
  if (document.type !== 'REMISSION') return;
  const ids = [...new Set(document.items.flatMap(item => item.assetId ? [item.assetId] : []))];
  if (!ids.length) return;
  const assets = await tx.asset.findMany({ where: { id: { in: ids } }, select: {
    id: true, kind: true, isImplement: true, internalNumber: true, sku: { select: { name: true, assetFamily: { select: { deliveryFuelSelectable: true } } } },
  } });
  for (const item of document.items) {
    const asset = assets.find(asset => asset.id === item.assetId);
    if (asset?.kind === 'MOTOR')
      throw new BadRequestException('Los motores anteriores se conservan para consulta y devolución histórica. En una entrega nueva selecciona eléctrica o gasolina en la mezcladora.');
    const selectable = !asset?.isImplement && asset?.sku.assetFamily?.deliveryFuelSelectable;
    if (selectable && !item.deliveryFuel)
      throw new BadRequestException(`Elige eléctrica o gasolina para ${asset.sku.name} #${asset.internalNumber ?? ''}.`);
    if (item.deliveryFuel && !selectable)
      throw new BadRequestException('Este equipo no admite selección de combustible por entrega.');
  }
}
