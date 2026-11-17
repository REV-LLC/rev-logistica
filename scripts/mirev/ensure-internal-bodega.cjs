const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient({datasourceUrl:process.env.DATABASE_PUBLIC_URL});
(async()=>{
 if(process.env.RAILWAY_PROJECT_ID!=='bec9984e-3e3a-48c8-9d75-8c87d591b931'||process.env.RAILWAY_ENVIRONMENT_ID!=='72a66cb9-3fc8-4c61-979a-56435cd20e8a'||!process.env.DATABASE_PUBLIC_URL)throw new Error('Wrong target');
 const result=await p.$transaction(async tx=>{
  const customerId='4f729cdf-a007-4ce5-bf3d-15288bbc7269';
  await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
  const customer=await tx.customer.findUnique({where:{id:customerId},select:{name:true,active:true}});
  if(!customer?.active||customer.name.toUpperCase()!=='RENTA EQUIPOS DEL VALLE')throw new Error('Customer mismatch');
  const name='BODEGA RENTA EQUIPOS DEL VALLE';
  const old=await tx.customerWorksite.findFirst({where:{customerId,OR:[{alias:{equals:name,mode:'insensitive'}},{worksite:{name:{equals:name,mode:'insensitive'}}}]},select:{id:true,active:true}});
  if(old){if(!old.active)throw new Error('Existing site inactive');return {id:old.id,created:false};}
  const worksite=await tx.worksite.upsert({where:{externalCode:'MIREV-BODEGA-RENTA-EQUIPOS-DEL-VALLE'},create:{externalCode:'MIREV-BODEGA-RENTA-EQUIPOS-DEL-VALLE',name},update:{},select:{id:true}});
  const link=await tx.customerWorksite.upsert({where:{customerId_worksiteId:{customerId,worksiteId:worksite.id}},create:{customerId,worksiteId:worksite.id,alias:name},update:{},select:{id:true}});
  return {id:link.id,worksiteId:worksite.id,created:true};
 });
 console.log(JSON.stringify({...result,name:'BODEGA RENTA EQUIPOS DEL VALLE',coordinatesConfigured:false,lotUntouched:true}));
})().catch(()=>{console.error('Could not ensure internal bodega');process.exitCode=1}).finally(()=>p.$disconnect());
