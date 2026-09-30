// Explicit local bootstrap of user-supplied values. Never imported by live billing.
const {PrismaClient}=require('@prisma/client');const {randomUUID}=require('node:crypto');
const {CommercialProfilesService}=require('../dist/src/commercial-profiles/commercial-profiles.service');
const defaults=require('./data/rev-commercial-family-defaults.json');
const {actorEmail}=require('./commercial-qa-target.cjs');
const db=new PrismaClient();const normalized=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
(async()=>{const actor=await db.user.findUniqueOrThrow({where:{email:actorEmail}});const service=new CommercialProfilesService(db);let created=0;
for(const family of await db.assetFamily.findMany()){
 const rule=defaults[normalized(family.name)];if(!rule)continue;
 const current=await service.get('FAMILY',family.id);if(current.version)continue;
 await service.save({scopeType:'FAMILY',scopeId:family.id,expectedVersion:0,effectiveFrom:'2026-09-01',groups:[],modes:[{id:randomUUID(),name:`Alquiler por ${rule.unit==='HOUR'?'horas':'días'}`,unit:rule.unit,minimum:{value:String(rule.minimum),basis:rule.unit==='HOUR'?'PER_REPORTED_DAY':'PER_RENTAL'},pricing:{source:'CATALOG'},conditions:[],parts:[]}]},actor.id);created++;
}console.log(`Local commercial family profiles created: ${created}`);})().finally(()=>db.$disconnect()).catch(e=>{console.error(e.message);process.exitCode=1});
