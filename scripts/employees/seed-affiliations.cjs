// Idempotent seed of sourced provider names. Never assigns or reactivates affiliations.
const { PrismaClient } = require('@prisma/client');
const reference = require('../../docs/reference/employee-affiliations-colombia.json');
const normalize = name => name.trim().replace(/\s+/g,' ').toLowerCase();
(async()=>{
  if(process.env.RAILWAY_PROJECT_ID!=='bec9984e-3e3a-48c8-9d75-8c87d591b931'||process.env.RAILWAY_ENVIRONMENT_ID!=='72a66cb9-3fc8-4c61-979a-56435cd20e8a'||!process.env.DATABASE_PUBLIC_URL)throw Error('Wrong production target');
  const db=new PrismaClient({datasourceUrl:process.env.DATABASE_PUBLIC_URL});
  try{
    const result=await db.$transaction(async tx=>{
      const schema=await tx.$queryRaw`SELECT current_schema() AS schema`;if(schema[0].schema!=='public')throw Error('Wrong schema');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rev_affiliations_seed'))`;
      const before=await tx.employeeAffiliationProvider.count();
      for(const item of reference.entities){
        const normalizedName=normalize(item.name);
        await tx.employeeAffiliationProvider.upsert({where:{kind_normalizedName:{kind:item.kind,normalizedName}},create:{kind:item.kind,name:item.name,normalizedName},update:{}});
      }
      return {created:await tx.employeeAffiliationProvider.count()-before,totals:await tx.employeeAffiliationProvider.groupBy({by:['kind'],_count:{_all:true}}),employeeAssignmentsChanged:false};
    },{timeout:30000,maxWait:10000});console.log(JSON.stringify(result));
  }finally{await db.$disconnect()}
})().catch(error=>{console.error(error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));process.exitCode=1});
