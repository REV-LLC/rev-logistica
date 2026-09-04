import { DocumentsService } from './documents.service';

const assetFamilies: Record<string, string> = {
  loader: 'loaders', loader2: 'loaders', bucket: 'loader-buckets',
  hammer: 'loader-hammers', forks: 'loader-forks', backhoeBucket: 'backhoe-buckets',
};
const rules = ['loader-buckets', 'loader-hammers', 'loader-forks'].map((id) => ({
  parentAssetFamilyId: 'loaders', componentAssetFamilyId: id,
  required: false, minimumQuantity: 0, maximumQuantity: 1, exclusiveGroup: 'IMPLEMENTO FRONTAL',
}));
const item = (assetId: string, parent: string | null = null) => ({
  assetId, componentParentAssetId: parent, skuId: null, quantity: null,
});

function createValidator(customRules = rules) {
  const prisma = {
    asset: { findMany: jest.fn().mockResolvedValue(Object.entries(assetFamilies).map(([id, family]) => ({
      id, sku: { assetFamilyId: family },
    }))) },
    sku: { findMany: jest.fn().mockResolvedValue([]) },
    assetFamilyComponent: { findMany: jest.fn().mockResolvedValue(customRules) },
  };
  const service = new DocumentsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return (items: ReturnType<typeof item>[]) => service['validateDocumentComponentRelations'](items);
}

describe('Document accessory compatibility and exclusive groups', () => {
  it('accepts a compatible bucket linked to its loader', async () => {
    await expect(createValidator()([item('loader'), item('bucket', 'loader')])).resolves.toBeUndefined();
  });
  it('allows a loader without optional attachments', async () => {
    await expect(createValidator()([item('loader')])).resolves.toBeUndefined();
  });
  it('rejects a backhoe bucket linked to a loader', async () => {
    await expect(createValidator()([item('loader'), item('backhoeBucket', 'loader')]))
      .rejects.toThrow('no está permitido');
  });
  it('rejects bucket and forks together in the same front-attachment group', async () => {
    await expect(createValidator()([item('loader'), item('bucket', 'loader'), item('forks', 'loader')]))
      .rejects.toThrow('Selecciona solo un implemento');
  });
  it('allows one implement per loader in the same document', async () => {
    await expect(createValidator()([
      item('loader'), item('loader2'), item('bucket', 'loader'), item('forks', 'loader2'),
    ])).resolves.toBeUndefined();
  });
  it('rejects the same accessory linked to two parents', async () => {
    await expect(createValidator()([
      item('loader'), item('loader2'), item('bucket', 'loader'), item('bucket', 'loader2'),
    ])).rejects.toThrow('más de una vez');
  });
  it('rejects an absent parent', async () => {
    await expect(createValidator()([item('bucket', 'loader')])).rejects.toThrow('equipo principal incluido');
  });
  it('keeps independent optional component rules independent', async () => {
    const independent = rules.map((rule) => ({ ...rule, exclusiveGroup: null })) as unknown as typeof rules;
    await expect(createValidator(independent)([
      item('loader'), item('bucket', 'loader'), item('forks', 'loader'),
    ])).resolves.toBeUndefined();
  });
});
