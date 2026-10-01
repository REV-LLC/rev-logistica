import { validateDocumentConfiguration } from './document-configuration';

const item = (assetId: string, parent?: string) => ({ assetId, componentParentAssetId: parent, quantity: null });
function fixture() {
  const asset = (id: string, family: string) => ({ id, publicCode: id, sku: { assetFamilyId: family },
    kind: family === 'motors' ? 'MOTOR' : 'STANDARD', motorConfiguration: id === 'mixer' ? 'INTERCHANGEABLE' : 'NONE', assignedMotorId: id === 'mixer' ? 'motor' : null });
  const family = (id: string, required = false, quantity = 1) => ({ familyId: id, family: { name: id }, required, quantity, maximumQuantity: 1 });
  const configs = [
    { assetId: 'mixer', entries: [] },
    { assetId: 'loader', entries: [family('buckets'), family('forks')] },
    { assetId: 'roller', entries: [{ accessoryId: 'roof', required: false, quantity: 1 }] },
  ];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    equipmentConfiguration: { findMany: jest.fn().mockImplementation(({ where }) => configs.filter(c => where.assetId.in.includes(c.assetId))) },
    asset: { findMany: jest.fn().mockResolvedValue([asset('mixer', 'mixers'), asset('motor', 'motors'), asset('motor2', 'motors'),
      asset('loader', 'loaders'), asset('bucket', 'buckets'), asset('bucket2', 'buckets'), asset('forks', 'forks'), asset('wrong', 'backhoe'), asset('roller', 'rollers')]) },
    sku: { findMany: jest.fn().mockResolvedValue([{ id: 'tips-sku', assetFamilyId: 'tips' }]) },
    documentItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const validate = (items: unknown[], type = 'REMISSION') => validateDocumentConfiguration(tx as never, { items: items as never, type, customerWorksiteId: 'site' });
  return { tx, configs, validate };
}

describe('Unified document composition', () => {
  it('requires the persistently assigned motor', async () => {
    await expect(fixture().validate([item('mixer')])).rejects.toThrow('motor asignado');
  });
  it('accepts only the assigned motor, never a replacement chosen in the document', async () => {
    await expect(fixture().validate([item('mixer'), item('motor', 'mixer')])).resolves.toBeUndefined();
    await expect(fixture().validate([item('mixer'), item('motor2', 'mixer')])).rejects.toThrow('motor asignado');
  });
  it('does not count a disconnected motor as satisfying the requirement', async () => {
    await expect(fixture().validate([item('mixer'), item('motor')])).rejects.toThrow('motor asignado');
  });
  it('keeps maximum quantities', async () => {
    await expect(fixture().validate([item('loader'), item('bucket', 'loader'), item('bucket2', 'loader')])).rejects.toThrow('máximo 1');
  });
  it('allows simultaneous transport of different compatible implements', async () => {
    await expect(fixture().validate([item('loader'), item('bucket', 'loader'), item('forks', 'loader')])).resolves.toBeUndefined();
  });
  it('missing part errors identify the equipment by its readable name, not its generated code', async () => {
    const f = fixture();
    f.configs[1].entries.push({ assetId: 'bucket', asset: { publicCode: 'BUCKET-IMPORT-LONG-CODE',
      internalNumber: 3, sku: { name: 'Balde New Holland' } }, required: true, quantity: 1 } as never);
    await expect(f.validate([item('loader')])).rejects.toThrow('Balde New Holland #3');
  });
  it('rejects incompatible equipment and absent parents', async () => {
    await expect(fixture().validate([item('loader'), item('wrong', 'loader')])).rejects.toThrow('no está permitida');
    await expect(fixture().validate([item('motor', 'mixer')])).rejects.toThrow('equipo principal');
  });
  it('rejects duplicate equipment', async () => {
    await expect(fixture().validate([item('loader'), item('bucket', 'loader'), item('bucket')])).rejects.toThrow('dos veces');
  });
  it('rejects document cycles', async () => {
    await expect(fixture().validate([item('loader', 'bucket'), item('bucket', 'loader')])).rejects.toThrow('contenerse');
  });
  it('does not require an optional roof', async () => {
    await expect(fixture().validate([item('roller')])).resolves.toBeUndefined();
  });
  it('validates required accessories before accessory lines are separated', async () => {
    const f = fixture();
    f.configs[2].entries[0].required = true;
    await expect(f.validate([item('roller')])).rejects.toThrow('requiere');
    await expect(f.validate([item('roller'), { accessoryId: 'roof', componentParentAssetId: 'roller', quantity: 1 }])).resolves.toBeUndefined();
  });
  it('allows a partial return without requiring the current default motor', async () => {
    await expect(fixture().validate([item('mixer')], 'RETURN')).resolves.toBeUndefined();
  });
  it('preserves a historical return even when its current configuration changed', async () => {
    const f = fixture();
    f.tx.documentItem.findMany.mockResolvedValue([{ assetId: 'wrong', componentParentAssetId: 'loader' }] as never);
    await expect(f.validate([item('loader'), item('wrong', 'loader')], 'RETURN')).resolves.toBeUndefined();
    expect(f.tx.documentItem.findMany.mock.calls[0][0]).toMatchObject({ where: { document: { customerWorksiteId: 'site', type: 'REMISSION', status: 'CONFIRMED' } } });
  });
});
