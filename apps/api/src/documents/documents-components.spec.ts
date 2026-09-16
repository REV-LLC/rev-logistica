import { DocumentsService } from './documents.service';

const assetFamilies: Record<string, string> = {
  loader: 'loaders', loader2: 'loaders', bucket: 'loader-buckets',
  hammer: 'loader-hammers', forks: 'loader-forks', backhoeBucket: 'backhoe-buckets',
};
const rules = ['loader-buckets', 'loader-hammers', 'loader-forks'].map((id) => ({
  parentAssetFamilyId: 'loaders', componentAssetFamilyId: id,
  required: false, minimumQuantity: 0, maximumQuantity: 1, exclusiveGroup: 'IMPLEMENTO FRONTAL',
  componentAssetFamily: { name: 'IMPLEMENTOS' },
}));
const item = (assetId: string, parent: string | null = null) => ({
  assetId, componentParentAssetId: parent, skuId: null, quantity: null,
});

function createValidator(customRules = rules, includeAssetLabels = true) {
  const prisma = {
    asset: { findMany: jest.fn().mockResolvedValue(Object.entries(assetFamilies).map(([id, family]) => ({
      id,
      internalNumber: includeAssetLabels ? 3 : null,
      sku: { assetFamilyId: family, name: includeAssetLabels ? 'MINICARGADOR' : '' },
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

  it('identifies a missing required component by family name and parent internal number, not its UUID', async () => {
    const componentFamilyId = '5270915e-4ca2-4e13-b553-a9994c89da4f';
    const requiredRules = [{
      ...rules[0],
      componentAssetFamilyId: componentFamilyId,
      required: true,
      minimumQuantity: 1,
      componentAssetFamily: { name: 'CUCHARONES' },
    }];
    await expect(createValidator(requiredRules)([item('loader')])).rejects.toMatchObject({
      status: 400,
      message: 'MINICARGADOR #3 requiere al menos 1 componente(s) de CUCHARONES.',
    });
  });

  it('uses readable fallbacks when the required component or parent labels are blank', async () => {
    const requiredRules = [{
      ...rules[0],
      componentAssetFamilyId: '5270915e-4ca2-4e13-b553-a9994c89da4f',
      required: true,
      minimumQuantity: 1,
      componentAssetFamily: { name: '  ' },
    }];
    await expect(createValidator(requiredRules, false)([item('loader')])).rejects.toThrow(
      'El equipo seleccionado requiere al menos 1 componente(s) de la familia de componentes requerida.',
    );
  });

  it('still accepts the same required component when its minimum quantity is met', async () => {
    const requiredRules = [{ ...rules[0], required: true, minimumQuantity: 1 }];
    await expect(createValidator(requiredRules)([item('loader'), item('bucket', 'loader')]))
      .resolves.toBeUndefined();
  });

  it('preserves structured recovery identifiers for incompatible simultaneous implements', async () => {
    await expect(createValidator()([
      item('loader'), item('bucket', 'loader'), item('forks', 'loader'),
    ])).rejects.toMatchObject({
      response: {
        code: 'EXCLUSIVE_COMPONENT_GROUP',
        recovery: {
          type: 'SELECT_ASSET_COMPONENT',
          parentAssetId: 'loader',
          group: 'IMPLEMENTO FRONTAL',
        },
      },
    });
  });
});
