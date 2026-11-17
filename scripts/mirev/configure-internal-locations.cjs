const {PrismaClient}=require('@prisma/client');
const {writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {distanceMeters,verificationReasons}=require('../../apps/api/dist/src/attendance/attendance-rules');
const p=new PrismaClient({datasourceUrl:process.env.DATABASE_PUBLIC_URL});
const sites=[
 {label:'BODEGA RENTA EQUIPOS DEL VALLE',linkId:'3732ec8b-8fee-47a4-a8c6-906e541be8f2',worksiteId:'5c81f25f-f754-4c29-9912-7172d7c5375c',address:'Carrera 22 #5A-07, Cali, Valle del Cauca, Colombia',latitude:3.4392968,longitude:-76.5361334,radius:100,placeId:'ChIJNbA_t4imMI4R_tQIUgYWwXY'},
 {label:'LOTE',linkId:'a16197f8-cddd-4ad4-bea4-97febb6c63ca',worksiteId:'036ca6a0-41fa-4caf-a8f3-cd1de1e3de73',address:'Calle 8A #22-29, Cali, Valle del Cauca, Colombia',latitude:3.437635,longitude:-76.534447,radius:100,placeId:'ChIJLcdrII-mMI4RXEOsdfgE0Rg'},
];
(async()=>{
 if(process.env.RAILWAY_PROJECT_ID!=='bec9984e-3e3a-48c8-9d75-8c87d591b931'||process.env.RAILWAY_ENVIRONMENT_ID!=='72a66cb9-3fc8-4c61-979a-56435cd20e8a'||!process.env.DATABASE_PUBLIC_URL)throw new Error('Wrong environment');
 const changes=await p.$transaction(async tx=>{
  const changes=[];
  for(const site of sites){
   await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${site.worksiteId} FOR UPDATE`;
   const link=await tx.customerWorksite.findUnique({where:{id:site.linkId},select:{customerId:true,worksiteId:true,active:true,worksite:{select:{address:true,attendanceLatitude:true,attendanceLongitude:true,attendanceRadiusMeters:true}}}});
   if(!link?.active||link.customerId!=='4f729cdf-a007-4ce5-bf3d-15288bbc7269'||link.worksiteId!==site.worksiteId)throw new Error('Site binding mismatch');
   const old=link.worksite;
   if(old.attendanceLatitude!==null&&(old.attendanceLatitude!==site.latitude||old.attendanceLongitude!==site.longitude))throw new Error('Existing location changed since inspection');
   await tx.worksite.update({where:{id:site.worksiteId},data:{address:site.address,attendanceLatitude:site.latitude,attendanceLongitude:site.longitude,attendanceRadiusMeters:site.radius}});
   changes.push({site:site.label,customerWorksiteId:site.linkId,worksiteId:site.worksiteId,before:old,after:{address:site.address,latitude:site.latitude,longitude:site.longitude,radiusMeters:site.radius},source:{provider:'Google Address Validation',placeId:site.placeId,validationGranularity:'PREMISE',geocodeGranularity:'SUB_PREMISE',hasReplacedComponents:false,hasUnconfirmedComponents:false}});
  }
  return changes;
 });
 const latest=await p.attendancePunch.findMany({where:{employee:{name:{contains:'SAMUEL',mode:'insensitive'},lastName:{contains:'GUERRERO',mode:'insensitive'}}},orderBy:{occurredAt:'desc'},take:2,select:{id:true,kind:true,status:true,reasons:true,occurredAt:true,latitude:true,longitude:true,accuracyMeters:true,similarity:true,threshold:true,modelVersion:true,referencePhotoHash:true,customerWorksiteId:true,employee:{select:{faceReference:{select:{photoHash:true,modelVersion:true}}}}}});
 const checks=latest.map(punch=>{
  const s=sites.find(s=>s.linkId===punch.customerWorksiteId);
  if(!s)return {siteNotPartOfThisChange:true};
  const distance=distanceMeters(punch.latitude,punch.longitude,s.latitude,s.longitude);
  const reference=punch.employee.faceReference;
  const reasons=verificationReasons({similarity:punch.similarity,threshold:punch.threshold,referenceCompatible:Boolean(reference&&reference.modelVersion===punch.modelVersion&&reference.photoHash===punch.referencePhotoHash),distance,radius:s.radius,accuracy:punch.accuracyMeters});
  return {kind:punch.kind,storedStatus:punch.status,storedReasons:punch.reasons,distanceMeters:Math.round(distance*10)/10,accuracyMeters:Math.round(punch.accuracyMeters*10)/10,verificationWithCurrentSettings:reasons.length?'PENDING':'VERIFIED',reasonsWithCurrentSettings:reasons};
 });
 const report={date:'2026-11-17',environment:'production',schema:'public',changes,separationMeters:Math.round(distanceMeters(sites[0].latitude,sites[0].longitude,sites[1].latitude,sites[1].longitude)*10)/10,existingPunchesModified:false,deploymentsPerformed:false,stagingModified:false,checks};
 writeFileSync(resolve(__dirname,'../../docs/infrastructure/mirev-ubicaciones-internas-2026-11-17.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message?.includes('environment')||e.message?.includes('mismatch')||e.message?.includes('changed')?e.message:'Location configuration failed');process.exitCode=1}).finally(()=>p.$disconnect());
