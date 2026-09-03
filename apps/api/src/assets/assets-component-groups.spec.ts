import { AssetsService } from './assets.service';

function validate(controlType = 'SERIAL') {
  const service = new AssetsService({
    assetFamily: { findUnique: jest.fn().mockResolvedValue({ controlType }) },
  } as never, {} as never);
  return service['validateExclusiveComponentGroup'].bind(service);
}

describe('Exclusive component rule configuration', () => {
  const alternative = {
    componentAssetFamilyId: 'bucket-family',
    exclusiveGroup: ' implemento frontal ',
    required: false, minimumQuantity: 0, maximumQuantity: 1,
  };
  it('normalizes group identity', async () => {
    await expect(validate()(alternative)).resolves.toBe('IMPLEMENTO FRONTAL');
  });
  it('rejects bulk alternatives', async () => {
    await expect(validate('BULK')(alternative)).rejects.toThrow('serializados');
  });
  it('does not make every alternative required', async () => {
    await expect(validate()({ ...alternative, required: true })).rejects.toThrow('opcional');
  });
  it('rejects unlimited quantities in an alternative group', async () => {
    await expect(validate()({ ...alternative, maximumQuantity: null })).rejects.toThrow('máximo 1');
  });
  it('allows removing a group', async () => {
    await expect(validate()({ ...alternative, exclusiveGroup: null })).resolves.toBeNull();
  });
});
