import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';

// Explicit QA-only conversion. Never read DATABASE_URL, never select "latest",
// never move stock or rewrite DocumentItem/StockLedger. Preview is the default.
const url = process.env.CONFIGURATION_QA_DATABASE_URL;
if (!url) throw new Error('Set CONFIGURATION_QA_DATABASE_URL to an isolated local clone.');
const parsed = new URL(url);
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !/^\/accessory_qa_[a-z0-9_]+$/.test(parsed.pathname))
  throw new Error('Only a local accessory_qa_* database is permitted.');
const apply = process.argv.includes('--apply');
const db = new PrismaClient({ datasources: { db: { url } } });
const mixerId = '8ea3d2fa-5894-4fcb-b668-55423ac817ab';
const classification: Record<string, 'COMPONENT' | 'ACCESSORY'> = {
  'MOTOR PARA MEZCLADORA': 'COMPONENT',
  'ACCESORIOS PARA COMPRESOR': 'ACCESSORY',
  'MARTILLO NEUMATICO': 'ACCESSORY',
  'PUNTAS PARA DEMOLEDOR': 'ACCESSORY',
  'BALDES PARA MINICARGADOR': 'ACCESSORY',
  'JUEGOS DE UÑAS ESTIBADORAS PARA MINICARGADOR': 'ACCESSORY',
  'MARTILLOS HIDRÁULICOS PARA MINICARGADOR': 'ACCESSORY',
  'BALDES PARA RETROEXCAVADORA': 'ACCESSORY',
};
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

async function run() {
  const rules = await db.assetFamilyComponent.findMany({ include: { componentAssetFamily: true } });
  const assets = await db.asset.findMany({ include: { sku: true, warehouseOwner: true } });
  const mixer = assets.find(a => a.id === mixerId);
  if (!mixer || mixer.internalNumber !== 6 || mixer.warehouseOwner.name !== 'Bodega Principal de Alquiler')
    throw new Error('The explicitly confirmed mixer #6 could not be identified.');
  for (const rule of rules.filter(rule => rule.active)) {
    if (!classification[rule.componentAssetFamily.name]) throw new Error(`Review classification: ${rule.componentAssetFamily.name}`);
    if (rule.maximumQuantity != null && rule.maximumQuantity < Math.max(1, rule.minimumQuantity))
      throw new Error(`Review quantity limits: ${rule.id}`);
  }
  const motorRules = rules.filter(r => r.active && classification[r.componentAssetFamily.name] === 'COMPONENT');
  for (const asset of assets.filter(a => a.motorConfiguration === 'INTERCHANGEABLE' && a.id !== mixerId)) {
    if (motorRules.filter(r => r.parentAssetFamilyId === asset.sku.assetFamilyId).length !== 1)
      throw new Error(`Review motor choice for ${asset.id}`);
  }
  console.log(JSON.stringify({ mode: apply ? 'apply-local-clone' : 'preview', database: parsed.pathname,
    activeFamilyRules: rules.filter(r => r.active).length,
    mixer: { id: mixer.id, number: mixer.internalNumber, owner: mixer.warehouseOwner.name,
      before: { fuel: mixer.fuel, motor: mixer.motorConfiguration },
      after: { subfamily: '1/2 bulto', fuel: 'ELECTRICO', motor: 'FIXED' } },
    note: 'Preserves old exclusive-group values in the archive. Document composition allows simultaneous transport of interchangeable implements.' }, null, 2));
  if (!apply) return;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration', 0))::text`;
    const archive = async (id: string, source: string, payload: unknown) => {
      await tx.equipmentConfigurationArchive.upsert({ where: { id }, create: { id, source, payload: json(payload) }, update: {} });
    };
    const fingerprints = async () => tx.$queryRaw<Array<{ name: string; count: bigint; hash: string }>>`
      SELECT 'DocumentItem' AS name, count(*), md5(string_agg(to_jsonb(t)::text, '' ORDER BY id)) AS hash FROM "DocumentItem" t
      UNION ALL SELECT 'StockLedger', count(*), md5(string_agg(to_jsonb(t)::text, '' ORDER BY id)) FROM "StockLedger" t
      UNION ALL SELECT 'AccessoryBalance', count(*), md5(string_agg(to_jsonb(t)::text, '' ORDER BY id)) FROM "AccessoryBalance" t`;
    const before = await fingerprints();
    const stringify = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
    for (const rule of rules) {
      const { componentAssetFamily: _, ...original } = rule;
      await archive(`family-rule:${rule.id}`, 'AssetFamilyComponent', original);
    }
    for (const asset of assets.filter(a => a.motorConfiguration !== 'NONE' || a.assignedMotorId))
      await archive(`motor:${asset.id}`, 'AssetMotorAssociation', { assetId: asset.id, motorConfiguration: asset.motorConfiguration, assignedMotorId: asset.assignedMotorId });

    // SKU/subfamily is shared by other mixers: give only #6 a separate reference.
    await archive(`mixer-half-bag:${mixer.id}`, 'AssetCorrection', { asset: mixer, reason: 'User confirmed internal #6: half-bag, electric, fixed motor.' });
    const subfamily = await tx.assetSubfamily.upsert({
      where: { assetFamilyId_name: { assetFamilyId: mixer.sku.assetFamilyId, name: '1/2 bulto' } },
      create: { assetFamilyId: mixer.sku.assetFamilyId, name: '1/2 bulto', code: 'MEDIO_BULTO' }, update: {},
    });
    const { id: skuId, createdAt: _, ...originalSku } = mixer.sku;
    const reference = await tx.sku.upsert({
      where: { assetFamilyId_name: { assetFamilyId: mixer.sku.assetFamilyId, name: 'MEZCLADORA 1/2 BULTO ELÉCTRICA MOTOR FIJO' } },
      create: { ...originalSku, assetSubfamilyId: subfamily.id, name: 'MEZCLADORA 1/2 BULTO ELÉCTRICA MOTOR FIJO' }, update: {},
    });
    if (reference.assetSubfamilyId !== subfamily.id) throw new Error('Existing half-bag reference has a conflicting subfamily.');
    const prices = await tx.providerSkuPrice.findMany({ where: { skuId } });
    for (const price of prices) await tx.providerSkuPrice.upsert({
      where: { providerWarehouseId_skuId: { providerWarehouseId: price.providerWarehouseId, skuId: reference.id } },
      create: { providerWarehouseId: price.providerWarehouseId, skuId: reference.id, price: price.price }, update: {},
    });
    await tx.asset.update({ where: { id: mixerId }, data: { skuId: reference.id, fuel: 'ELECTRICO', motorConfiguration: 'FIXED', assignedMotorId: null } });
    const counter = await tx.assetInternalCounter.upsert({
      where: { ownerWarehouseId_assetSubfamilyId: { ownerWarehouseId: mixer.warehouseOwnerId, assetSubfamilyId: subfamily.id } },
      create: { ownerWarehouseId: mixer.warehouseOwnerId, assetSubfamilyId: subfamily.id, nextNumber: 7 }, update: {},
    });
    if (counter.nextNumber < 7) await tx.assetInternalCounter.update({ where: { id: counter.id }, data: { nextNumber: 7 } });

    const currentAssets = await tx.asset.findMany({ include: { sku: true } });
    for (const asset of currentAssets) {
      const applicable = rules.filter(r => r.active && r.parentAssetFamilyId === asset.sku.assetFamilyId);
      if (!applicable.length && asset.motorConfiguration === 'NONE' && !asset.assignedMotorId) continue;
      const config = await tx.equipmentConfiguration.upsert({ where: { assetId: asset.id }, create: { assetId: asset.id }, update: {}, include: { entries: true } });
      if (await tx.equipmentConfigurationArchive.findUnique({ where: { id: `converted:${asset.id}` } })) continue;
      for (const [index, rule] of applicable.entries()) {
        const motor = classification[rule.componentAssetFamily.name] === 'COMPONENT';
        if (motor) continue; // Motor assignment is persistent on Asset, never a document choice.
        const required = rule.required || rule.minimumQuantity > 0 || (motor && asset.motorConfiguration === 'INTERCHANGEABLE');
        await tx.equipmentConfigurationEntry.upsert({
          where: { configurationId_familyId: { configurationId: config.id, familyId: rule.componentAssetFamilyId } },
          create: { id: randomUUID(), configurationId: config.id, familyId: rule.componentAssetFamilyId,
            role: classification[rule.componentAssetFamily.name], required, defaultIncluded: false,
            quantity: motor && required ? 1 : Math.max(rule.minimumQuantity, 1),
            maximumQuantity: motor && required ? 1 : rule.maximumQuantity, sortOrder: config.entries.length + index }, update: {},
        });
      }
      const saved = await tx.equipmentConfiguration.update({ where: { id: config.id },
        data: { version: { increment: 1 }, ...(asset.motorConfiguration === 'FIXED' ? { notes: `Motor fijo integrado · ${asset.fuel ?? 'combustible sin identificar'}. No requiere un motor separado en el documento.` } : {}) }, include: { entries: true } });
      await tx.equipmentConfigurationRevision.create({ data: { configurationId: config.id, before: json(config), after: json(saved), createdBy: 'LOCAL-QA-CUTOVER-20260924' } });
      await archive(`converted:${asset.id}`, 'ConfigurationConversion', { configurationId: config.id, assetId: asset.id });
    }
    const after = await fingerprints();
    if (stringify(before) !== stringify(after)) throw new Error('Cutover touched stock or historical document items; rolling back.');
    console.log('Historical document items, stock ledger and accessory balances unchanged:', stringify(after));
  }, { isolationLevel: 'Serializable', timeout: 60000 });
  console.log('Local cutover committed. Original tables retained until code replacement and verification are complete.');
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
