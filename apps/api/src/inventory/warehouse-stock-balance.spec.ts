import { physicalWarehouseLedgerWhere } from './warehouse-stock-balance';

describe('physicalWarehouseLedgerWhere', () => {
  it('uses warehouseId as the physical location without filtering worksite traceability', () => {
    const where = physicalWarehouseLedgerWhere('warehouse-1');

    expect(where).toEqual({ warehouseId: 'warehouse-1' });
    expect(where).not.toHaveProperty('customerWorksiteId');
  });
});
