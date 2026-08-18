import { projectInventoryForRequest } from './request-inventory-projection';

const inventory = {
  customerWorksiteId: 'worksite-1',
  bulk: [
    {
      skuId: 'jack',
      skuName: 'Gato extra largo',
      ownerWarehouseId: 'provider-a',
      ownerWarehouseName: 'Proveedor A',
      quantity: 2,
    },
    {
      skuId: 'jack',
      skuName: 'Gato extra largo',
      ownerWarehouseId: 'provider-b',
      ownerWarehouseName: 'Proveedor B',
      quantity: 3,
    },
    {
      skuId: 'mixer',
      skuName: 'Mezcladora',
      ownerWarehouseId: 'provider-a',
      ownerWarehouseName: 'Proveedor A',
      quantity: 1,
    },
  ],
  serial: [],
};

describe('projectInventoryForRequest', () => {
  it('keeps provider rows separate for staff', () => {
    const result = projectInventoryForRequest(inventory, 'STAFF');

    expect(result.bulk).toHaveLength(3);
    expect(result.bulk[0]).toMatchObject({
      ownerWarehouseId: 'provider-a',
      ownerWarehouseName: 'Proveedor A',
      allocationStatus: 'ASSIGNED',
    });
    expect(result.presentation.showOwnerWarehouse).toBe(true);
  });

  it('groups the same catalog item for drivers when multiple providers own it', () => {
    const result = projectInventoryForRequest(inventory, 'DRIVER');
    const jack = result.bulk.find((item) => item.skuId === 'jack');

    expect(result.bulk).toHaveLength(2);
    expect(jack).toMatchObject({
      quantity: 5,
      ownerWarehouseId: null,
      ownerWarehouseName: null,
      allocationStatus: 'PENDING',
    });
    expect(result.presentation.showOwnerWarehouse).toBe(false);
  });

  it('retains the owner internally when only one provider owns the item', () => {
    const result = projectInventoryForRequest(inventory, 'DRIVER');
    const mixer = result.bulk.find((item) => item.skuId === 'mixer');

    expect(mixer).toMatchObject({
      ownerWarehouseId: 'provider-a',
      ownerWarehouseName: null,
      allocationStatus: 'ASSIGNED',
    });
  });
});
