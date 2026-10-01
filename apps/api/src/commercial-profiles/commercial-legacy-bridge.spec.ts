import { legacyCommercialBridge } from './commercial-legacy-bridge';
import { commercialNodesAt } from './commercial-history-v2';
import { prepareCommercialV2 } from '../annexes/annex-commercial-v2-source';
import { Prisma } from '@prisma/client';
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const modes = ['DAY', 'METER'].map((unit, i) => ({
  id: uuid(i + 1),
  name: 'Genérico',
  unit,
  minimum: { value: '0', basis: 'PER_RENTAL' },
  pricing: { source: 'FIXED', amount: i ? '10' : '100' },
  conditions: [
    {
      groupId: uuid(3),
      presence: i ? 'PRESENT' : 'ABSENT',
      minimumQuantity: 1,
    },
  ],
  parts: [{ groupId: uuid(3), treatment: 'INCLUDED' }],
}));
const snapshot = {
  schemaVersion: 2,
  status: 'RESOLVED',
  catalog: { unit: 'DAY', price: '100' },
  parts: [],
  frozenProfile: {
    id: uuid(4),
    version: 1,
    effectiveFrom: '2026-10-01',
    groups: [
      {
        id: uuid(3),
        name: 'Pieza',
        selectors: [{ kind: 'ACCESSORY', id: uuid(5) }],
      },
    ],
    modes,
  },
};
const source = {
  id: 'old-ledger',
  assetId: 'asset',
  quantity: new Prisma.Decimal(1),
  effectiveAt: new Date('2026-09-18T12:00Z'),
  asset: {
    id: 'asset',
    sku: { id: 'sku', name: 'Equipo', assetFamilyId: 'family' },
  },
};
const origin = {
  id: 'reviewed',
  sourceLedgerId: source.id,
  sourceLedger: source,
  effectiveFrom: new Date('2026-10-01T05:00Z'),
  commercialSnapshot: snapshot,
};
const mock = (rows: unknown[] = [source]) => ({
  legacyEquipmentOrigin: { findMany: jest.fn().mockResolvedValue([origin]) },
  stockLedger: { findMany: jest.fn().mockResolvedValue(rows) },
});
describe('read-only reviewed legacy bridge', () => {
  it('preserves an explicitly reviewed historical parent without inferring one', async () => {
    const tx = mock();
    tx.legacyEquipmentOrigin.findMany.mockResolvedValue([
      { ...origin, parentOriginId: 'reviewed-parent' },
    ] as any);
    const bridge = await legacyCommercialBridge(tx as any, 'site', '2026-10-06');
    expect(commercialNodesAt(bridge.documents, '2026-10-01')[0].parentId).toBe(
      'legacy-origin:reviewed-parent',
    );
  });
  it('creates graph projections at the reviewed date without writing historical rows', async () => {
    const tx = mock();
    const bridge = await legacyCommercialBridge(
      tx as any,
      'site',
      '2026-10-06',
    );
    expect(bridge.entries[0]).toMatchObject({
      sourceLedgerId: 'old-ledger',
      nodeId: 'legacy-origin:reviewed',
      effectiveFrom: '2026-10-01',
    });
    expect(commercialNodesAt(bridge.documents, '2026-09-30')).toHaveLength(0);
    expect(commercialNodesAt(bridge.documents, '2026-10-01')[0].id).toBe(
      'legacy-origin:reviewed',
    );
    expect(source.effectiveAt.toISOString()).toBe('2026-09-18T12:00:00.000Z');
  });
  it('closes the old rental on its physical return and never reuses it for a new delivery', async () => {
    const bridge = await legacyCommercialBridge(
      mock([
        source,
        { ...source, id: 'return', effectiveAt: new Date('2026-10-05T12:00Z') },
        {
          ...source,
          id: 'new-delivery',
          effectiveAt: new Date('2026-10-07T12:00Z'),
        },
      ]) as any,
      'site',
      '2026-10-08',
    );
    expect(commercialNodesAt(bridge.documents, '2026-10-05')).toHaveLength(1);
    expect(commercialNodesAt(bridge.documents, '2026-10-06')).toHaveLength(0);
    expect(commercialNodesAt(bridge.documents, '2026-10-08')).toHaveLength(0);
  });
  it('splits the existing stock lot when a new implement references the reviewed parent', async () => {
    const bridge = await legacyCommercialBridge(
      mock() as any,
      'site',
      '2026-10-06',
    );
    const child = {
      id: 'new-doc',
      type: 'REMISSION',
      docDate: new Date('2026-10-04T12:00Z'),
      items: [
        {
          id: 'new-piece',
          compositionNodeId: uuid(8),
          parentLegacyOriginId: 'reviewed',
          accessoryId: uuid(5),
          accessory: { name: 'Implemento' },
          quantity: 1,
        },
      ],
    };
    const lot = {
      id: 'old-ledger',
      skuId: 'sku',
      assetId: 'asset',
      label: 'Equipo',
      deliveredOn: '2026-09-18',
      quantity: '1',
      source: { reference: 'old-ledger', origin: 'INVENTORY' as const },
      returns: [],
      pricing: { basePrice: '100' },
      waivedDays: [],
    };
    const result = prepareCommercialV2(
      [...bridge.documents, child] as any,
      [{ lot, itemId: 'legacy-origin:reviewed' }],
      [
        {
          requestId: 'document:new-doc:item:new-piece',
          documentId: 'new-doc',
          accessoryId: uuid(5),
          quantity: 1,
          from: { warehouseId: 'w' },
          to: { customerWorksiteId: 'site' },
        },
      ],
      { from: '2026-10-01', to: '2026-10-15', through: '2026-10-06' },
      'site',
      [],
    );
    const parent = result.rentals.filter((r) => r.assetId === 'asset');
    expect(
      parent.map((r) => [
        r.commercialInterval?.from,
        r.commercialInterval?.to,
        r.commercial?.mode?.unit,
      ]),
    ).toEqual([
      ['2026-10-01', '2026-10-03', 'DAY'],
      ['2026-10-04', '2026-10-06', 'METER'],
    ]);
    expect(
      parent.every(
        (r) =>
          r.source.reference === 'old-ledger' && r.deliveredOn === '2026-09-18',
      ),
    ).toBe(true);
    expect(
      result.rentals.find((r) => r.accessoryId === uuid(5))?.pricing.basePrice,
    ).toBe('0.00');
  });
});
