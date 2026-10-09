import { validateDocumentConfiguration } from '../accessories/document-configuration';

const item = (assetId: string, parent?: string) => ({ assetId, componentParentAssetId: parent, quantity: null });
function fixture(required = false) {
  const entry = { familyId: 'buckets', family: { name: 'BALDES' }, quantity: 1, required, maximumQuantity: 1 };
  const config = { assetId: 'loader', entries: [entry] };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    equipmentConfiguration: { findMany: jest.fn().mockResolvedValue([config]) },
    asset: { findMany: jest.fn().mockResolvedValue([
      { id: 'loader', internalNumber: 3, sku: { name: 'MINICARGADOR', assetFamilyId: 'loaders' } },
      { id: 'bucket', sku: { assetFamilyId: 'buckets' } },
      { id: 'bucket2', sku: { assetFamilyId: 'buckets' } },
      { id: 'wrong', sku: { assetFamilyId: 'backhoes' } },
    ]) },
    sku: { findMany: jest.fn().mockResolvedValue([]) },
    documentItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { tx, config, entry, validate: (items: ReturnType<typeof item>[], type = 'REMISSION') =>
    validateDocumentConfiguration(tx as never, { items, type, customerWorksiteId: 'site' }) };
}
describe('Document component contract after unified configuration cutover', () => {
  it('accepts a unit from the configured family', async () => {
    await expect(fixture().validate([item('loader'), item('bucket', 'loader')])).resolves.toBeUndefined();
  });
  it('allows an optional piece to be omitted', async () => {
    await expect(fixture().validate([item('loader')])).resolves.toBeUndefined();
  });
  it('rejects an incompatible piece', async () => {
    await expect(fixture().validate([item('loader'), item('wrong', 'loader')])).rejects.toThrow('no está permitida');
  });
  it('requires the referenced parent in the document', async () => {
    await expect(fixture().validate([item('bucket', 'loader')])).rejects.toThrow('equipo principal');
  });
  it('never duplicates a physical identity', async () => {
    await expect(fixture().validate([item('loader'), item('bucket', 'loader'), item('bucket')])).rejects.toThrow('dos veces');
  });
  it('does not enforce quantity caps stored by the previous model', async () => {
    await expect(fixture().validate([item('loader'), item('bucket', 'loader'), item('bucket2', 'loader')])).resolves.toBeUndefined();
  });
  it('allows an old required implement to be omitted without editing its historical rule', async () => {
    await expect(fixture(true).validate([item('loader')])).resolves.toBeUndefined();
  });
  it('accepts a required part with its parent reference', async () => {
    await expect(fixture(true).validate([item('loader'), item('bucket', 'loader')])).resolves.toBeUndefined();
  });
  it('does not apply remission requirements to a partial return', async () => {
    await expect(fixture(true).validate([item('loader')], 'RETURN')).resolves.toBeUndefined();
  });
  it('rejects self-reference', async () => {
    await expect(fixture().validate([item('loader', 'loader')])).rejects.toThrow('contenerse');
  });
  it('reads a configuration instead of global legacy family rules', async () => {
    const f = fixture();
    await f.validate([item('loader')]);
    expect(f.tx.equipmentConfiguration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId: { in: ['loader'] } },
    }));
  });
  it('supports a historically documented return after reconfiguration', async () => {
    const f = fixture();
    f.tx.documentItem.findMany.mockResolvedValue([{ assetId: 'wrong', componentParentAssetId: 'loader' }] as never);
    await expect(f.validate([item('loader'), item('wrong', 'loader')], 'RETURN')).resolves.toBeUndefined();
  });
  it('does not rewrite a stored legacy requirement while validating a new document', async () => {
    const f = fixture(true);
    const previous = { ...f.entry };
    await expect(f.validate([item('loader')])).resolves.toBeUndefined();
    expect(f.entry).toEqual(previous);
  });
});
