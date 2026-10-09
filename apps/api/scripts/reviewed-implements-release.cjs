/* Reviewed 2026-10-09 cutover. Preview/exercise on a fresh production clone;
 * production application requires the exact reviewed manifest, backup and fingerprint.
 * Credentials arrive only through stdin from the explicitly selected Railway service.
 * Never retarget one of the older local-only conversion scripts.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { ImplementPromotionService, promotionFingerprint } = require('../dist/src/accessories/implement-promotion.service');
const { BulkImplementPromotionService } = require('../dist/src/accessories/bulk-implement-promotion.service');
const { legacyCommercialBridge } = require('../dist/src/commercial-profiles/commercial-legacy-bridge');
const { commercialNodesAt } = require('../dist/src/commercial-profiles/commercial-history-v2');
const { resolveComposition } = require('../dist/src/commercial-profiles/commercial-composition');
const value = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const mode = value('mode') ?? 'preview';
const target = value('target') ?? 'rehearsal';
const rollback = new Error('REVIEWED_RELEASE_ROLLBACK');
const json = v => JSON.parse(JSON.stringify(v));
const tables = ['Document','DocumentItem','Accessory','AccessoryBalance','AccessoryMovement','AccessoryRevision','AccessoryAsset','AccessorySubfamily','LegacyEquipmentOrigin','AnnexDraftRevision'];
async function proof(tx) {
 const result = [];
 for (const table of tables) {
  const [r] = await tx.$queryRawUnsafe(`SELECT count(*)::text count,md5(coalesce(string_agg(h,'' ORDER BY h),'')) hash FROM (SELECT md5(to_jsonb(t)::text) h FROM "${table}" t) q`);
  result.push({table,...r});
 }
 return result;
}
async function run(variables) {
 assert(['preview','exercise','apply','verify'].includes(mode));
 const manifest = JSON.parse(fs.readFileSync(value('manifest'), 'utf8'));
 assert.equal(manifest.projectId,'bec9984e-3e3a-48c8-9d75-8c87d591b931');
 assert.equal(manifest.environmentId,'72a66cb9-3fc8-4c61-979a-56435cd20e8a');
 assert.equal(manifest.rows.length,14);
 assert.equal(new Set(manifest.rows.map(r=>r.sourceId)).size,14);
 const backup = fs.readFileSync(manifest.backup.path);
 assert.equal(backup.subarray(0,5).toString(),'PGDMP');
 assert.equal(createHash('sha256').update(backup).digest('hex'),manifest.backup.sha256);
 const connection = target === 'production' ? variables.DATABASE_PUBLIC_URL : process.env.IMPLEMENTS_RELEASE_REHEARSAL_URL;
 const url = new URL(connection);
 if (target === 'production') {
  assert.equal(variables.RAILWAY_PROJECT_ID,manifest.projectId);
  assert.equal(variables.RAILWAY_ENVIRONMENT_ID,manifest.environmentId);
  assert.equal(variables.RAILWAY_SERVICE_ID,'8ae3aa5c-80f8-4572-ae8c-7080bb6637d5');
  assert(url.hostname.endsWith('.rlwy.net') && url.pathname==='/railway');
  assert(['apply','verify'].includes(mode),'Production preview requires a reviewed clone; application is explicit.');
 } else {
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54414');
  assert.equal(url.pathname,'/implements_prod_rehearsal_20261009');
  assert(['preview','exercise','apply','verify'].includes(mode));
 }
 const db = new PrismaService({datasources:{db:{url:connection}}});
 let report;
 try {
 await db.$transaction(async tx => {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
  const actor = await tx.user.findUniqueOrThrow({where:{id:manifest.actorId}});
  assert(actor.active && actor.role==='ADMIN');
  const at = new Date(manifest.effectiveAt), day = manifest.effectiveDay;
  if (mode==='verify') {
   const bridges=await tx.implementIdentityBridge.findMany({where:{accessoryId:{in:manifest.rows.map(r=>r.sourceId)}},include:{asset:true,openingLedger:true,commercialOriginReview:true}});
   assert.equal(bridges.length,14);
   assert.equal(bridges.filter(b=>b.assetId).length,12);assert.equal(bridges.filter(b=>b.skuId).length,2);
   assert.equal(await tx.equipmentConfigurationEntry.count({where:{accessoryId:{not:null}}}),0);
   assert.equal(await tx.accessory.count({where:{implementBridge:null,balances:{some:{quantity:{gt:0}}}}}),0);
   assert.equal(await tx.asset.count({where:{assignedMotorId:{not:null}}}),0);
   for(const pair of manifest.rows.filter(r=>r.parentOriginId)){
    const bridge=bridges.find(b=>b.accessoryId===pair.sourceId);assert.equal(bridge.commercialOriginReview.parentOriginId,pair.parentOriginId);
    const graph=await legacyCommercialBridge(tx,bridge.openingLedger.customerWorksiteId,day);
    const resolved=resolveComposition(commercialNodesAt(graph.documents,day)).get('implement-origin:'+bridge.id);
    assert.equal(resolved.status,'RESOLVED');assert.equal(resolved.contextualZero,true);
   }
   report={status:'VERIFIED',target,nativeAssets:12,nativeBulk:2,legacyPositiveUnbridged:0,legacyConfigurationTargets:0};return;
  }
  // Short cutover only: prevent concurrent logistics writes while reviewing/applying.
  // No backup, network call or deployment occurs while these locks are held.
  await tx.$executeRawUnsafe('LOCK TABLE "Accessory","AccessoryBalance","AccessoryMovement","AccessoryRevision","AccessoryAsset","Document","DocumentItem","StockLedger","Asset","Sku","AssetSubfamily","EquipmentConfiguration","EquipmentConfigurationEntry","CommercialProfile","CommercialProfileRevision","LegacyEquipmentOrigin","AnnexDraftRevision" IN SHARE ROW EXCLUSIVE MODE');
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('equipment-configuration',0))::text`;
  const before = await proof(tx), originalLedger = await tx.stockLedger.findMany({orderBy:{id:'asc'}});
  assert.equal(await tx.implementIdentityBridge.count(),0,'This manifest is for a first cutover, not an overwrite. Use verify after success.');
  assert.equal(await tx.annexDraftRevision.count(),0,'Saved annex adjustments require separate review.');
  const sources=await tx.accessory.findMany({orderBy:{id:'asc'},include:{balances:{orderBy:{id:'asc'}},movements:{orderBy:{id:'asc'}},assets:{orderBy:{assetId:'asc'}}}});
  const configurations=await tx.equipmentConfiguration.findMany({orderBy:{id:'asc'},include:{entries:{orderBy:{id:'asc'}}}});
  const profiles=await tx.commercialProfile.findMany({orderBy:{id:'asc'},include:{revisions:{orderBy:{id:'asc'}}}});
  const origins=await tx.legacyEquipmentOrigin.findMany({where:{id:{in:manifest.rows.flatMap(r=>r.parentOriginId?[r.parentOriginId]:[])}},orderBy:{id:'asc'},include:{sourceLedger:{include:{asset:{include:{ledger:{orderBy:{id:'asc'}}}}}}}});
  const fingerprint=promotionFingerprint({manifest,sources,configurations,profiles,origins});
  report={status:'PREVIEW',target,fingerprint,effectiveAt:manifest.effectiveAt,units:manifest.rows.map(r=>({sourceId:r.sourceId,name:r.name,bulk:!!r.bulk,number:r.number??null})),historicalProof:before};
  if(mode==='preview')throw rollback;
  assert.equal(value('fingerprint'),fingerprint,'Evidence changed: stop and review a fresh production snapshot.');
  const retired=await tx.accessory.findUniqueOrThrow({where:{id:manifest.caseRetiredId},include:{balances:true,movements:true}});
  assert.equal(retired.balances.reduce((n,b)=>n+b.quantity,0),0);assert(retired.movements.some(m=>m.type==='RETIRE'));
  for(const config of configurations.filter(c=>c.entries.some(e=>e.required||e.maximumQuantity!=null||e.familyId&&!e.recommendation))){
   await tx.equipmentConfigurationArchive.create({data:{id:'production-implement-recommendations-v1:'+config.id,source:'REVIEWED_PRODUCTION_IMPLEMENT_RELEASE',payload:json(config)}});
   for(const entry of config.entries)await tx.equipmentConfigurationEntry.update({where:{id:entry.id},data:{required:false,maximumQuantity:null,recommendation:!!(entry.recommendation||entry.familyId||entry.required||entry.maximumQuantity!=null||entry.defaultIncluded)}});
   const saved=await tx.equipmentConfiguration.update({where:{id:config.id},data:{version:{increment:1}},include:{entries:{orderBy:{id:'asc'}}}});
   await tx.equipmentConfigurationRevision.create({data:{configurationId:config.id,before:json(config),after:json(saved),createdBy:actor.id}});
  }
  const serial=new ImplementPromotionService(db),bulk=new BulkImplementPromotionService(),converted=[];
  for(const row of manifest.rows){
   const source=await tx.accessory.findUniqueOrThrow({where:{id:row.sourceId}});
   const familyId=row.bulk?manifest.bulkFamilyId:source.familyId;
   const family=await tx.assetFamily.findUniqueOrThrow({where:{id:familyId}});assert.equal(family.controlType,row.bulk?'BULK':'SERIAL');
   let sub=await tx.assetSubfamily.findUnique({where:{assetFamilyId_code:{assetFamilyId:familyId,code:row.sub}}});
   if(!sub)sub=await tx.assetSubfamily.create({data:{id:row.subId,assetFamilyId:familyId,code:row.sub,name:row.sub,createdAt:at,updatedAt:at}});
   let sku=await tx.sku.findUnique({where:{assetFamilyId_name:{assetFamilyId:familyId,name:row.name}}});
   if(!sku){const image=row.caseDefault?(await tx.sku.findUniqueOrThrow({where:{id:manifest.bucketImageSkuId}})).imageUrl:null;
    sku=await tx.sku.create({data:{id:row.skuId,assetFamilyId:familyId,assetSubfamilyId:sub.id,name:row.name,price:0,chargeType:'DAY',isImplement:true,isConsumable:false,imageUrl:image,createdAt:at}});}
   assert(sku.active&&sku.isImplement&&!sku.isConsumable);assert.equal(sku.assetSubfamilyId,sub.id);
   if(row.caseDefault){
    // This exact physical replacement was confirmed by the user. Reconcile the
    // retired default before promotion so preserving the pre-existing compatibility
    // cannot create a second row for the very same native bucket.
    const previous=await tx.equipmentConfiguration.findUniqueOrThrow({where:{assetId:manifest.caseParentId},include:{entries:{orderBy:{id:'asc'}}}});
    const entry=previous.entries.find(e=>e.id===manifest.caseEntryId);assert(entry&&entry.accessoryId===manifest.caseRetiredId&&entry.defaultIncluded);
    await tx.equipmentConfigurationEntry.update({where:{id:entry.id},data:{accessoryId:source.id,required:false,maximumQuantity:null,recommendation:true}});
    const saved=await tx.equipmentConfiguration.update({where:{id:previous.id},data:{version:{increment:1}},include:{entries:{orderBy:{id:'asc'}}}});
    await tx.equipmentConfigurationRevision.create({data:{configurationId:saved.id,before:json(previous),after:json(saved),createdBy:actor.id}});
   }
   const input=row.bulk?{accessoryId:source.id,skuId:sku.id,effectiveAt:at,quantity:1,confirmation:row.confirmation}
    :{accessoryId:source.id,skuId:sku.id,effectiveAt:at,internalNumber:row.number,assetDescription:source.name,unconfiguredPrice:'0',...(row.origin?{sourceDocumentItemId:row.origin,reviewedWarehouse:{id:row.warehouse,confirmation:row.confirmation}}:{})};
   const plan=row.bulk?await bulk.preview(tx,input,actor.id):await serial.previewInTransaction(tx,input,actor.id);assert.equal(plan.status,'READY');
   const result=row.bulk?await bulk.apply(tx,input,actor.id,plan.fingerprint):await serial.promoteInTransaction(tx,input,actor.id,plan.fingerprint);
   if(row.caseDefault){
    const links=await tx.equipmentConfigurationEntry.findMany({where:{assetId:result.asset.id},include:{configuration:true}});
    assert.equal(links.length,1);assert.equal(links[0].id,manifest.caseEntryId);assert.equal(links[0].configuration.assetId,manifest.caseParentId);assert(links[0].defaultIncluded);
   }
   if(row.parentOriginId){
    const origin=await tx.legacyEquipmentOrigin.findUniqueOrThrow({where:{id:row.parentOriginId},include:{sourceLedger:{include:{document:true}}}});
    const bridge=result.bridge,ledger=origin.sourceLedger,custody=bridge.evidenceSnapshot.reviewedCustody;
    assert.equal(ledger.assetId,custody.parentAssetId);assert.equal(ledger.customerWorksiteId,custody.customerWorksiteId);assert.equal(ledger.ownerWarehouseId,custody.ownerWarehouseId);
    assert.equal(ledger.document.status,'CONFIRMED');assert.equal(ledger.reversedByDocumentId,null);
    assert(bridge.evidenceSnapshot.frozenCommercialSnapshot.frozenProfile.modes.every(m=>Number(m.minimum.value)===0));
    await tx.implementCommercialOriginReview.create({data:{bridgeId:bridge.id,parentOriginId:origin.id,reviewedBy:actor.id,evidenceSnapshot:{schemaVersion:1,bridgeId:bridge.id,parentOriginId:origin.id,sourceLedgerId:ledger.id,assetId:ledger.assetId,customerWorksiteId:ledger.customerWorksiteId,ownerWarehouseId:ledger.ownerWarehouseId,sourceDocumentId:ledger.refDocumentId,consecutive:ledger.document.consecutive,confirmation:'Reviewed original custody and existing commercial parent origin; no physical unit assignment or inferred compatibility.'}}});
   }
   const counts=await Promise.all([tx.asset.count(),tx.stockLedger.count(),tx.implementIdentityBridge.count()]);
   const replay=row.bulk?await bulk.apply(tx,input,actor.id,plan.fingerprint):await serial.promoteInTransaction(tx,input,actor.id,plan.fingerprint);assert(replay.replayed);
   assert.deepEqual(await Promise.all([tx.asset.count(),tx.stockLedger.count(),tx.implementIdentityBridge.count()]),counts);
   converted.push({sourceId:source.id,assetId:result.bridge.assetId,skuId:result.bridge.skuId,bulk:!!row.bulk});
  }
  assert.deepEqual(await proof(tx),before);
  assert.deepEqual(await tx.stockLedger.findMany({where:{id:{in:originalLedger.map(l=>l.id)}},orderBy:{id:'asc'}}),originalLedger);
  assert.equal(await tx.equipmentConfigurationEntry.count({where:{accessoryId:{not:null}}}),0);
  assert.equal(await tx.accessory.count({where:{implementBridge:null,balances:{some:{quantity:{gt:0}}}}}),0);
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
  report={...report,status:mode==='exercise'?'EXERCISED_WITH_FULL_ROLLBACK':'APPLIED',converted,historicalRowsUnchanged:true,existingLedgerUnchanged:true,replayWithoutDuplicates:true};
  if(mode==='exercise')throw rollback;
 },{timeout:60000});
 }catch(e){if(e!==rollback)throw e;}finally{await db.$disconnect();}
 console.log(JSON.stringify(report));
}
if(target==='production'){let data='';process.stdin.on('data',v=>data+=v).on('end',()=>{let variables;try{variables=JSON.parse(data);data='';}catch{process.stderr.write('Invalid private credentials input\n');process.exitCode=1;return;}run(variables).catch(e=>{console.error('Cutover stopped: '+e.message);process.exitCode=1;});});}
else run({}).catch(e=>{console.error('Cutover stopped: '+e.message);process.exitCode=1;});
