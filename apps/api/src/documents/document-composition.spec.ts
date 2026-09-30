import { isDocumentCompositionV2, normalizeComposition, prepareDocumentComposition, validateDocumentComposition } from './document-composition';

const date = new Date('2026-10-02T12:00:00Z');
const root = { compositionNodeId: 'root', assetId: 'machine' };
const attachment = { compositionNodeId: 'attachment', accessoryId: 'attachment', parentCompositionNodeId: 'root', quantity: 1 };
const consumable = { compositionNodeId: 'consumable', accessoryId: 'tips', parentCompositionNodeId: 'attachment', quantity: 3 };
const source = { id: 'source', documentId: 'remission', assetId: null, skuId: null, accessoryId: 'tips',
  componentParentAssetId: 'machine', quantity: 5, compositionParent: null, parentSourceDocumentItemId: null,
  document: { id: 'remission', type: 'REMISSION', status: 'CONFIRMED', customerWorksiteId: 'site', docDate: new Date('2026-10-01T12:00:00Z') } };
const returned = (quantity: number, node = 'return') => ({ compositionNodeId: node, accessoryId: 'tips', quantity, sourceDocumentItemId: 'source' });
function fixture() {
  const previous: Array<{ sourceDocumentItemId: string; quantity: number }> = [];
  const tx = {
    documentItem: { findMany: jest.fn(async ({ where }) => where.id ? [source] : previous) },
    accessory: { findMany: jest.fn(async () => [{ id: 'attachment' }]) },
  };
  const validate = (items: unknown[], type = 'RETURN') => validateDocumentComposition(tx as never, {
    id: 'current', docDate: date, type, customerWorksiteId: 'site', items: items as never,
  });
  return { tx, previous, validate };
}

describe('Document composition v2', () => {
  it('uses the Bogotá civil date, not the UTC date or approval timestamp', () => {
    expect(isDocumentCompositionV2(new Date('2026-10-01T04:59:59Z'))).toBe(false);
    expect(isDocumentCompositionV2(new Date('2026-10-01T05:00:00Z'))).toBe(true);
  });
  it('preserves stable nested accessory identities independent of ordering', () => {
    expect(normalizeComposition([consumable, root, attachment])).toEqual([consumable, root, attachment]);
  });
  it('rejects duplicate identities, cycles, missing parents and two parents', () => {
    expect(() => normalizeComposition([root, root])).toThrow('misma identidad');
    expect(() => normalizeComposition([{ ...root, parentCompositionNodeId: 'attachment' }, attachment])).toThrow('ciclos');
    expect(() => normalizeComposition([consumable])).toThrow('Falta la fila');
    expect(() => normalizeComposition([root, { ...attachment, parentSourceDocumentItemId: 'previous' }])).toThrow('solo puede tener un padre');
  });
  it('derives accessory custody from its nearest equipment ancestor, without flattening the tree', async () => {
    const rows = await prepareDocumentComposition({} as never, [consumable, root, attachment], date);
    expect(rows[0]).toMatchObject({ componentParentAssetId: 'machine', parentCompositionNodeId: 'attachment' });
    expect(rows[2]).toMatchObject({ componentParentAssetId: 'machine', parentCompositionNodeId: 'root' });
  });
  it('does not attach the new system to historical rows', async () => {
    expect(await prepareDocumentComposition({} as never, [root], new Date('2026-09-30T12:00:00Z'))).toEqual([{ assetId: 'machine' }]);
    await expect(prepareDocumentComposition({} as never, [root, attachment, consumable], new Date('2026-09-30T12:00:00Z'))).rejects.toThrow('1 de octubre');
  });
  it('accepts a partial return and excludes the same direct document from earlier returns', async () => {
    const f = fixture(); f.previous.push({ sourceDocumentItemId: 'source', quantity: 2 });
    await expect(f.validate([returned(3)])).resolves.not.toBeNull();
    expect(f.tx.documentItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ documentId: { not: 'current' } }) }));
  });
  it('sums sibling return rows before comparing with the source quantity', async () => {
    await expect(fixture().validate([returned(3, 'a'), returned(3, 'b')])).rejects.toThrow('supera lo pendiente');
  });
  it('rejects a forged source identity or another worksite', async () => {
    await expect(fixture().validate([{ ...returned(1), accessoryId: 'wrong' }])).rejects.toThrow('no corresponde');
    const f = fixture(); f.tx.documentItem.findMany.mockResolvedValue([{ ...source, document: { ...source.document, customerWorksiteId: 'other' } }] as never);
    await expect(f.validate([returned(1)])).rejects.toThrow('misma obra');
  });
});
