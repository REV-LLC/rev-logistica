const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({datasourceUrl: process.env.DATABASE_PUBLIC_URL});
(async () => {
 if (!process.env.DATABASE_PUBLIC_URL) throw new Error('No public database endpoint configured');
 const result = await p.$transaction(async tx => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  return {activeEmployees: await tx.employee.count({where:{active:true}}), linkedActiveAccounts: await tx.employee.count({where:{active:true,user:{active:true}}}), approvedReferences: await tx.employeeFaceReference.count(), geofencedSites: await tx.worksite.count({where:{active:true,attendanceLatitude:{not:null},attendanceLongitude:{not:null}}}), referenceModels: await tx.employeeFaceReference.groupBy({by:['modelVersion'],_count:true}), schema:await tx.$queryRawUnsafe('select current_schema() as schema')};
 });
 console.log(JSON.stringify(result));
})().catch(()=>{console.error('Read-only readiness check failed');process.exitCode=1}).finally(()=>p.$disconnect());
