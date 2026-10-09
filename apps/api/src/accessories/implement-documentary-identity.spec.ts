import { reviewedDocumentaryIdentities } from './implement-documentary-identity';

describe('reviewed documentary identity alias', () => {
  const at = new Date('2026-10-09T15:00:00Z');
  const source = { id: 'original-line', accessoryId: 'old-unit', assetId: null, skuId: null };
  function fixture() {
    const bridge = { accessoryId: 'old-unit', assetId: 'native-unit', effectiveAt: at,
      openingLedger: { assetId: 'native-unit', isOpeningBalance: true, effectiveAt: at },
      evidenceSnapshot: { schemaVersion: 1, documentarySource: { id: source.id }, before: { source: { id: 'old-unit' } }, asset: { id: 'native-unit' } } };
    const tx = { implementIdentityBridge: { findMany: jest.fn().mockResolvedValue([bridge]) } };
    return { bridge, tx };
  }
  it('projects only the reviewed source after cutover without rewriting it', async () => {
    const f = fixture();
    expect(await reviewedDocumentaryIdentities(f.tx as never, [source], at)).toEqual([{ ...source, assetId: 'native-unit', accessoryId: null }]);
    expect(source.accessoryId).toBe('old-unit');
    expect(await reviewedDocumentaryIdentities(f.tx as never, [source], new Date(at.getTime() - 1))).toEqual([source]);
    const other = { ...source, id: 'another-delivery' };
    expect(await reviewedDocumentaryIdentities(f.tx as never, [other], at)).toEqual([other]);
  });
  it('rejects incomplete evidence and an opening for another unit', async () => {
    const f = fixture();
    f.bridge.openingLedger.assetId = 'another-unit';
    expect(await reviewedDocumentaryIdentities(f.tx as never, [source], at)).toEqual([source]);
    f.bridge.openingLedger.assetId = 'native-unit';
    f.bridge.evidenceSnapshot.asset.id = 'forged';
    expect(await reviewedDocumentaryIdentities(f.tx as never, [source], at)).toEqual([source]);
  });
  it('does not invent another worksite return after a reviewed warehouse correction', async () => {
    const f = fixture();
    Object.assign(f.bridge.evidenceSnapshot.before, { reviewedWarehouse: { id: 'owner', confirmation: 'User confirmed in warehouse' } });
    expect(await reviewedDocumentaryIdentities(f.tx as never, [source], at)).toEqual([source]);
  });
});
