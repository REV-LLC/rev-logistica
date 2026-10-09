import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DocumentCompositionItemDto } from './dto/document-composition-item.dto';
import { compositionFields, prepareDocumentComposition } from './document-composition';
import { validateDeliveryFuel } from './document-delivery-fuel';
import { buildPdfItemDescription } from './document-pdf.service';
import { commercialNodesAt } from '../commercial-profiles/commercial-history-v2';

const asset = { id: 'mixer', internalNumber: 2, sku: { name: 'Mezcladora', assetFamily: { deliveryFuelSelectable: true } } };
const tx = { asset: { findMany: jest.fn().mockResolvedValue([asset]) } };
describe('delivery fuel is documentary, not an assigned motor', () => {
  it.each(['ELECTRICO', 'GASOLINA'])('accepts %s without touching any motor or asset', async deliveryFuel => {
    await expect(validateDeliveryFuel(tx as never, { type: 'REMISSION', items: [{ assetId: 'mixer', deliveryFuel }] })).resolves.toBeUndefined();
    expect(compositionFields({ deliveryFuel })).toMatchObject({ deliveryFuel });
  });
  it('requires a deliberate choice only for families configured to ask', async () => {
    await expect(validateDeliveryFuel(tx as never, { type: 'REMISSION', items: [{ assetId: 'mixer' }] })).rejects.toThrow('Elige');
    await expect(validateDeliveryFuel({ asset: { findMany: async () => [{ ...asset, sku: { ...asset.sku, assetFamily: { deliveryFuelSelectable: false } } }] } } as never,
      { type: 'REMISSION', items: [{ assetId: 'mixer' }] })).resolves.toBeUndefined();
  });
  it('does not require a new choice on historical returns', async () => {
    await expect(validateDeliveryFuel(tx as never, { type: 'RETURN', items: [{ assetId: 'mixer' }] })).resolves.toBeUndefined();
  });
  it('retires new standalone motor dispatches but preserves historical returns', async () => {
    const db = { asset: { findMany: async () => [{ ...asset, kind: 'MOTOR' }] } };
    await expect(validateDeliveryFuel(db as never, { type: 'REMISSION', items: [{ assetId: 'mixer' }] })).rejects.toThrow('consulta y devolución histórica');
    await expect(validateDeliveryFuel(db as never, { type: 'RETURN', items: [{ assetId: 'mixer' }] })).resolves.toBeUndefined();
  });
  it('an implement in the same family does not inherit the fuel prompt', async () => {
    const db = { asset: { findMany: async () => [{ ...asset, isImplement: true }] } };
    await expect(validateDeliveryFuel(db as never, { type: 'REMISSION', items: [{ assetId: 'mixer' }] })).resolves.toBeUndefined();
  });
  it('rejects arbitrary tags and tags on unconfigured equipment', async () => {
    await expect(validateDeliveryFuel(tx as never, { type: 'REMISSION', items: [{ assetId: 'mixer', deliveryFuel: 'DIESEL' }] })).rejects.toThrow('Selecciona');
    await expect(validateDeliveryFuel(tx as never, { type: 'REMISSION', items: [{ assetId: 'other', deliveryFuel: 'ELECTRICO' }] })).rejects.toThrow('no admite');
  });
  it('inherits the original delivery tag on return, refusing an inconsistent override', async () => {
    const db = { documentItem: { findMany: async () => [{ id: 'source', deliveryFuel: 'GASOLINA', assetId: 'mixer', compositionParent: null }] } };
    const line = { assetId: 'mixer', sourceDocumentItemId: 'source' };
    expect(await prepareDocumentComposition(db as never, [line], new Date('2026-10-10'))).toMatchObject([{ deliveryFuel: 'GASOLINA' }]);
    await expect(prepareDocumentComposition(db as never, [{ ...line, deliveryFuel: 'ELECTRICO' }], new Date('2026-10-10'))).rejects.toThrow('coincidir');
  });
  it('prints the delivered fuel instead of the permanent catalog fuel', () => {
    const item = { deliveryFuel: 'ELECTRICO', asset: { sku: { name: 'Mezcladora gasolina', assetFamily: { name: 'Mezcladora' } } } };
    expect(buildPdfItemDescription(item as never)).toBe('Mezcladora · Eléctrica');
    expect(buildPdfItemDescription({ ...item, deliveryFuel: null } as never)).toBe('Mezcladora gasolina');
  });
  it('keeps separate documentary labels for commercial projections without changing prices', () => {
    const snapshot = { status: 'REVIEW', schemaVersion: 2, parts: [] };
    const docs = [{ type: 'REMISSION', docDate: new Date('2026-10-10T15:00Z'), items: [
      { id: 'electric', assetId: 'mixer', asset: { sku: { name: 'Mezcladora GASOLINA' } }, deliveryFuel: 'ELECTRICO', commercialSnapshot: snapshot },
      { id: 'gas', assetId: 'mixer', asset: { sku: { name: 'Mezcladora GASOLINA' } }, deliveryFuel: 'GASOLINA', commercialSnapshot: snapshot },
    ] }];
    const nodes = commercialNodesAt(docs as never, '2026-10-10');
    expect(nodes.map(node => node.label)).toEqual(['Mezcladora · Eléctrica', 'Mezcladora · Gasolina']);
    expect(nodes.every(node => node.snapshot === snapshot)).toBe(true);
  });
  it('validates structured input in all shared document DTOs', async () => {
    expect(await validate(plainToInstance(DocumentCompositionItemDto, { deliveryFuel: 'GASOLINA' }))).toHaveLength(0);
    expect((await validate(plainToInstance(DocumentCompositionItemDto, { deliveryFuel: 'arbitrary' }))).length).toBeGreaterThan(0);
  });
});
