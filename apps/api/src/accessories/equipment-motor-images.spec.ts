import { EquipmentMotorsService } from './equipment-motors.service';

describe('Motor equipment thumbnails', () => {
  it('includes unit/template image URLs in the paginated query, without looking up each asset', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new EquipmentMotorsService({ asset: { findMany } } as any);
    await service.candidates('', 0, true);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        skip: 0,
        select: expect.objectContaining({
          imageFileObject: { select: { storageKey: true } },
          sku: {
            select: {
              name: true,
              imageUrl: true,
              imageFileObject: { select: { storageKey: true } },
            },
          },
          motorCompatibility: {
            select: {
              equipment: {
                select: expect.objectContaining({
                  imageFileObject: { select: { storageKey: true } },
                }),
              },
            },
          },
        }),
      }),
    );
  });
});
