'use strict';
// Production-only, additive migration. No R2 writes, deletes, or evidence updates.
const {Client}=require('pg');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const migration='20261119230000_employee_document_separation';
const sql=readFileSync(resolve(__dirname,'../../apps/api/prisma/migrations',migration,'migration.sql'),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
async function snapshot(db){
 const result={};
 for(const table of ['FileObject','WhatsappReportEvidence','WhatsappInboundMessage']){
  const {rows}=await db.query(`SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY row_to_json(t)::text`);
  result[table]={count:rows.length,sha256:createHash('sha256').update(rows.map(x=>x.row).join('\n')).digest('hex')};
 }
 return result;
}
(async()=>{
 if(process.env.RAILWAY_PROJECT_ID!=='bec9984e-3e3a-48c8-9d75-8c87d591b931'||process.env.RAILWAY_ENVIRONMENT_ID!=='72a66cb9-3fc8-4c61-979a-56435cd20e8a'||!process.env.DATABASE_PUBLIC_URL)throw Error('Wrong production target');
 const db=new Client({connectionString:process.env.DATABASE_PUBLIC_URL});await db.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  if((await db.query('SELECT current_schema() AS schema')).rows[0].schema!=='public')throw Error('Wrong schema');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('employee_document_separation_20261119'))");
  const before=await snapshot(db);
  const applied=(await db.query('SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=$1',[migration])).rows;
  if(applied.length){if(applied.length!==1||applied[0].checksum!==checksum||!applied[0].finished_at||applied[0].rolled_back_at)throw Error('Migration state mismatch');}
  else{
   if((await db.query(`SELECT to_regclass('public."EmployeeDocument"') AS table_name`)).rows[0].table_name)throw Error('Unrecorded EmployeeDocument table; manual review required');
   await db.query(sql);
   await db.query('INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES ($1,$2,NOW(),$3,NOW(),1)',[randomUUID(),checksum,migration]);
  }
  const after=await snapshot(db);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Existing file/evidence metadata changed');
  const counts=(await db.query(`SELECT (SELECT count(*)::int FROM "EmployeeDocument") AS personnel_documents, (SELECT count(*)::int FROM "FileObject" WHERE "entityType"='EMPLOYEE' AND "category"='EVIDENCIA_WHATSAPP') AS employee_operational_evidence`)).rows[0];
  await db.query('COMMIT');console.log(JSON.stringify({migration,alreadyApplied:applied.length>0,preserved:after,...counts}));
 }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
})().catch(()=>{console.error('Document separation migration failed; transaction rolled back. No credentials or file content logged.');process.exitCode=1});
