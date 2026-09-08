import {
  resolveLatestSerializedMovements,
  type SerializedLedgerMovement,
} from './serialized-ledger-location';

const effectiveAt = new Date('2026-09-03T12:00:00.000Z');
const registeredAt = new Date('2026-09-08T13:34:00.000Z');

function row(overrides: Partial<SerializedLedgerMovement> = {}): SerializedLedgerMovement {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    assetId: 'mixer-3',
    ownerWarehouseId: 'provider',
    warehouseId: 'provider',
    customerWorksiteId: null,
    movementType: 'ADJUST',
    quantity: 1,
    refDocumentId: null,
    refDocumentType: null,
    isOpeningBalance: true,
    effectiveAt: registeredAt,
    createdAt: registeredAt,
    ...overrides,
  };
}

function transfer(refDocumentType = 'PROVIDER_PICKUP') {
  const shared = {
    isOpeningBalance: false,
    refDocumentId: 'provider-transfer',
    refDocumentType,
    effectiveAt,
    createdAt: registeredAt,
  };
  const source = row({
    ...shared,
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    movementType: 'OUT',
    quantity: -1,
  });
  const destination = row({
    ...shared,
    id: '00000000-0000-0000-0000-000000000002',
    movementType: 'IN',
    warehouseId: 'our-warehouse',
  });
  return { source, destination };
}

describe('serialized ledger location resolution', () => {
  it('returns no serialized result for empty input or bulk rows', () => {
    expect(resolveLatestSerializedMovements([]).size).toBe(0);
    expect(resolveLatestSerializedMovements([row({ assetId: null })]).size).toBe(0);
  });

  it('keeps a sole catalogue opening as the baseline without changing its dates', () => {
    const opening = row();
    expect(resolveLatestSerializedMovements([opening]).get('mixer-3')).toEqual({
      latest: opening, locationMovement: opening,
    });
    expect(opening.effectiveAt).toBe(registeredAt);
    expect(opening.createdAt).toBe(registeredAt);
  });

  it('prioritizes a historical real delivery over a later catalogue registration', () => {
    const opening = row();
    const delivered = row({
      id: 'delivery', isOpeningBalance: false, effectiveAt,
      movementType: 'OUT', quantity: -1, customerWorksiteId: 'customer-site',
      refDocumentId: 'remission', refDocumentType: 'REMISSION',
    });
    expect(resolveLatestSerializedMovements([opening, delivered]).get('mixer-3')).toEqual({
      latest: delivered, locationMovement: delivered,
    });
  });

  it.each(['PROVIDER_PICKUP', 'PROVIDER_RECEIPT'])(
    'resolves a complete %s destination even when the OUT UUID sorts last',
    (type) => {
      const { source, destination } = transfer(type);
      expect(resolveLatestSerializedMovements([destination, row(), source]).get('mixer-3')).toEqual({
        latest: source, locationMovement: destination,
      });
    },
  );

  it('resolves the same complete transfer when the IN UUID sorts last', () => {
    const { source, destination } = transfer();
    [source.id, destination.id] = [destination.id, source.id];
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')).toEqual({
      latest: destination, locationMovement: destination,
    });
  });

  it.each([
    ['PROVIDER_PICKUP', 1],
    ['PROVIDER_RECEIPT', 1],
    ['PROVIDER_RECEIPT', 60000],
    ['PROVIDER_RECEIPT', 86400000],
  ])('resolves a complete legacy %s with IN recorded %s ms after OUT without changing timestamps', (type, delay) => {
    const { source, destination } = transfer(String(type));
    destination.effectiveAt = new Date(source.effectiveAt.getTime() + Number(delay));
    destination.createdAt = new Date(source.createdAt.getTime() + Number(delay));
    const sourceBefore = { ...source };
    const destinationBefore = { ...destination };
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')).toEqual({
      latest: destination, locationMovement: destination,
    });
    expect(source).toEqual(sourceBefore);
    expect(destination).toEqual(destinationBefore);
  });

  it('accepts a unified operational timestamp with sequential audit timestamps', () => {
    const { source, destination } = transfer('PROVIDER_RECEIPT');
    destination.createdAt = new Date(source.createdAt.getTime() + 1);
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')).toEqual({
      latest: destination, locationMovement: destination,
    });
  });

  it.each(['effectiveAt', 'createdAt'] as const)('rejects a transfer whose IN %s precedes its OUT', (field) => {
    const { source, destination } = transfer('PROVIDER_RECEIPT');
    destination[field] = new Date(source[field].getTime() - 1);
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')?.locationMovement).toBeNull();
  });

  it('accepts Prisma Decimal-like quantities without rewriting row objects', () => {
    const { source, destination } = transfer();
    source.quantity = { toString: () => '-1' };
    destination.quantity = { toString: () => '1' };
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')?.locationMovement)
      .toBe(destination);
  });

  it('preserves a legitimate single-IN provider receipt from transit', () => {
    const transit = row({
      id: 'transit', isOpeningBalance: false, effectiveAt,
      movementType: 'TRANSIT', warehouseId: null, customerWorksiteId: 'worksite',
      refDocumentType: 'RETURN', refDocumentId: 'return-document',
    });
    const receipt = row({
      id: 'receipt', isOpeningBalance: false, movementType: 'IN',
      refDocumentId: 'provider-receipt', refDocumentType: 'PROVIDER_RECEIPT',
    });
    expect(resolveLatestSerializedMovements([row(), transit, receipt]).get('mixer-3')).toEqual({
      latest: receipt, locationMovement: receipt,
    });
  });

  it('does not require a fabricated transit history for a valid terminal provider receipt', () => {
    const receipt = row({
      isOpeningBalance: false, movementType: 'IN',
      refDocumentId: 'provider-receipt', refDocumentType: 'PROVIDER_RECEIPT',
    });
    expect(resolveLatestSerializedMovements([receipt]).get('mixer-3')?.locationMovement).toBe(receipt);
  });

  it('keeps a new dispatch after transit-to-provider receipt as the latest location', () => {
    const receipt = row({
      id: 'receipt', isOpeningBalance: false, movementType: 'IN',
      refDocumentId: 'provider-receipt', refDocumentType: 'PROVIDER_RECEIPT',
    });
    const dispatch = row({
      id: 'dispatch', isOpeningBalance: false, movementType: 'OUT', quantity: -1,
      effectiveAt: new Date(registeredAt.getTime() + 1), customerWorksiteId: 'new-worksite',
      refDocumentId: 'new-remission', refDocumentType: 'REMISSION',
    });
    expect(resolveLatestSerializedMovements([row(), receipt, dispatch]).get('mixer-3')).toEqual({
      latest: dispatch, locationMovement: dispatch,
    });
  });

  it('resolves a custody return to provider when OUT has the greatest UUID', () => {
    const { source, destination } = transfer('PROVIDER_RECEIPT');
    source.warehouseId = 'our-warehouse';
    destination.warehouseId = 'provider';
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')).toEqual({
      latest: source, locationMovement: destination,
    });
  });

  it.each([
    ['non-owner destination', { warehouseId: 'our-warehouse' }],
    ['missing destination', { warehouseId: null }],
    ['opening balance', { isOpeningBalance: true }],
    ['worksite attached', { customerWorksiteId: 'worksite' }],
    ['positive source instead of receipt', { movementType: 'OUT' }],
    ['zero quantity', { quantity: 0 }],
    ['negative quantity', { quantity: -1 }],
    ['multiple units', { quantity: 2 }],
    ['pickup without a source', { refDocumentType: 'PROVIDER_PICKUP' }],
  ] satisfies Array<[string, Partial<SerializedLedgerMovement>]>)(
    'does not accept a single provider receipt with %s',
    (_name, change) => {
      const receipt = row({
        isOpeningBalance: false, movementType: 'IN',
        refDocumentId: 'provider-receipt', refDocumentType: 'PROVIDER_RECEIPT',
        ...change,
      });
      expect(resolveLatestSerializedMovements([receipt]).get('mixer-3')?.locationMovement).toBeNull();
    },
  );

  it.each([
    ['another owner', { ownerWarehouseId: 'another-owner' }],
    ['another document type', { refDocumentType: 'PROVIDER_PICKUP' }],
    ['missing document type', { refDocumentType: null }],
  ] satisfies Array<[string, Partial<SerializedLedgerMovement>]>)(
    'does not mistake a malformed receipt OUT with %s for an unrelated event',
    (_name, change) => {
      const { source, destination } = transfer('PROVIDER_RECEIPT');
      [source.id, destination.id] = [destination.id, source.id];
      source.warehouseId = 'our-warehouse';
      destination.warehouseId = 'provider';
      Object.assign(source, change);
      expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')).toEqual({
        latest: destination, locationMovement: null,
      });
    },
  );

  it('rejects extra rows of the same document/asset outside an otherwise complete pair', () => {
    const { source, destination } = transfer('PROVIDER_RECEIPT');
    const extra = { ...source, id: 'extra', createdAt: new Date(registeredAt.getTime() - 1) };
    expect(resolveLatestSerializedMovements([source, destination, extra]).get('mixer-3')?.locationMovement)
      .toBeNull();
  });

  it.each(['source', 'destination'] as const)('fails closed for a transfer missing its %s', (missing) => {
    const pair = transfer();
    const remaining = missing === 'source' ? pair.destination : pair.source;
    expect(resolveLatestSerializedMovements([row(), remaining]).get('mixer-3')).toEqual({
      latest: remaining, locationMovement: null,
    });
  });

  it.each(['source', 'destination'] as const)(
    'rejects duplicate destinations regardless of whether the %s UUID is greatest',
    (greatest) => {
      const { source, destination } = transfer();
      if (greatest === 'destination') {
        [source.id, destination.id] = [destination.id, source.id];
      }
      const duplicate = { ...destination, id: '40000000-0000-0000-0000-000000000000', warehouseId: 'third-warehouse' };
      expect(resolveLatestSerializedMovements([source, destination, duplicate]).get('mixer-3')?.locationMovement)
        .toBeNull();
    },
  );

  it('rejects duplicate source legs', () => {
    const { source, destination } = transfer();
    const duplicate = { ...source, id: '80000000-0000-0000-0000-000000000000' };
    expect(resolveLatestSerializedMovements([source, duplicate, destination]).get('mixer-3')?.locationMovement)
      .toBeNull();
  });

  it.each([
    ['another asset', { assetId: 'another-asset' }],
    ['another owner', { ownerWarehouseId: 'another-owner' }],
    ['another document', { refDocumentId: 'another-document' }],
    ['another document type', { refDocumentType: 'PROVIDER_RECEIPT' }],
    ['an earlier effective time', { effectiveAt: new Date(effectiveAt.getTime() - 1) }],
    ['an earlier creation time', { createdAt: new Date(registeredAt.getTime() - 1) }],
  ] satisfies Array<[string, Partial<SerializedLedgerMovement>]>)(
    'never pairs an OUT with an IN from %s',
    (_name, change) => {
      const { source, destination } = transfer();
      const unrelated = { ...destination, ...change };
      expect(resolveLatestSerializedMovements([unrelated, source]).get('mixer-3')).toEqual({
        latest: source, locationMovement: null,
      });
    },
  );

  it.each([
    ['source opening balance', 'source', { isOpeningBalance: true }],
    ['destination opening balance', 'destination', { isOpeningBalance: true }],
    ['source worksite', 'source', { customerWorksiteId: 'worksite' }],
    ['destination worksite', 'destination', { customerWorksiteId: 'worksite' }],
    ['missing source warehouse', 'source', { warehouseId: null }],
    ['missing destination warehouse', 'destination', { warehouseId: null }],
    ['same warehouses', 'destination', { warehouseId: 'provider' }],
    ['wrong source quantity', 'source', { quantity: -2 }],
    ['wrong destination quantity', 'destination', { quantity: 2 }],
    ['zero source quantity', 'source', { quantity: 0 }],
    ['zero destination quantity', 'destination', { quantity: 0 }],
    ['wrong source movement', 'source', { movementType: 'ADJUST' }],
    ['wrong destination movement', 'destination', { movementType: 'TRANSIT' }],
  ] satisfies Array<[string, 'source' | 'destination', Partial<SerializedLedgerMovement>]>)(
    'fails closed for %s',
    (_name, changedLeg, change) => {
      const pair = transfer();
      pair[changedLeg] = { ...pair[changedLeg], ...change };
      expect(resolveLatestSerializedMovements([pair.source, pair.destination]).get('mixer-3')?.locationMovement)
        .toBeNull();
    },
  );

  it('rejects a third movement within an otherwise balanced provider transfer', () => {
    const { source, destination } = transfer();
    const extra = { ...source, id: 'extra', movementType: 'ADJUST', quantity: 0 };
    expect(resolveLatestSerializedMovements([source, destination, extra]).get('mixer-3')?.locationMovement)
      .toBeNull();
  });

  it.each([
    { refDocumentId: null },
    { refDocumentType: null },
    { refDocumentType: 'REMISSION' },
  ])('preserves existing semantics without a provider event identity: %j', (change) => {
    const { source, destination } = transfer();
    Object.assign(source, change);
    Object.assign(destination, change);
    expect(resolveLatestSerializedMovements([source, destination]).get('mixer-3')).toEqual({
      latest: source, locationMovement: source,
    });
  });

  it('does not resurrect an old transfer destination after a later dispatch', () => {
    const { source, destination } = transfer();
    const dispatched = row({
      id: 'dispatch', isOpeningBalance: false,
      effectiveAt: new Date('2026-09-04T12:00:00.000Z'),
      refDocumentId: 'remission', refDocumentType: 'REMISSION',
      movementType: 'OUT', quantity: -1, warehouseId: 'our-warehouse',
      customerWorksiteId: 'worksite',
    });
    expect(resolveLatestSerializedMovements([source, destination, dispatched]).get('mixer-3')).toEqual({
      latest: dispatched, locationMovement: dispatched,
    });
  });

  it('keeps UUID ordering between separate events with equal timestamps', () => {
    const first = transfer();
    const second = transfer('PROVIDER_RECEIPT');
    second.source.id = '20000000-0000-0000-0000-000000000000';
    second.destination.id = '10000000-0000-0000-0000-000000000000';
    second.source.refDocumentId = 'second-document';
    second.destination.refDocumentId = 'second-document';
    second.source.warehouseId = 'our-warehouse';
    second.destination.warehouseId = 'provider';
    expect(resolveLatestSerializedMovements([
      second.destination, first.destination, second.source, first.source,
    ]).get('mixer-3')).toEqual({ latest: first.source, locationMovement: first.destination });
  });

  it('orders by effective date then registration time then UUID within non-opening rows', () => {
    const earlier = row({ id: 'z', isOpeningBalance: false, effectiveAt });
    const laterEffective = { ...earlier, id: 'a', effectiveAt: new Date(effectiveAt.getTime() + 1) };
    const laterCreated = { ...laterEffective, id: 'b', createdAt: new Date(registeredAt.getTime() + 1) };
    const greatestId = { ...laterCreated, id: 'c' };
    expect(resolveLatestSerializedMovements([
      laterCreated, earlier, greatestId, laterEffective,
    ]).get('mixer-3')?.latest).toBe(greatestId);
  });

  it('handles multiple assets independently and preserves generic fields and frozen inputs', () => {
    const { source, destination } = transfer();
    const another = row({ assetId: 'another-asset', warehouseId: 'another-warehouse' });
    const extendedDestination = { ...destination, warehouseName: 'Bodega Principal' };
    const rows = Object.freeze([Object.freeze(source), Object.freeze(another), Object.freeze(extendedDestination)]);
    const before = [...rows];
    const result = resolveLatestSerializedMovements(rows);
    expect(result.get('mixer-3')?.locationMovement).toBe(extendedDestination);
    expect(result.get('another-asset')?.locationMovement).toBe(another);
    expect(rows).toEqual(before);
  });
});
