import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EmployeeDocumentsService } from '../employee-portal/employee-documents.service';

const url=process.env.EMPLOYEE_DOCUMENT_TEST_DATABASE_URL;
(url?describe:describe.skip)('personnel document migration with real isolated Postgres',()=>{
  let db:PrismaClient, employeeId:string, otherId:string,document:any,evidence:any,ambiguous:any,before:any[];
  beforeAll(async()=>{
    const target=new URL(url!);
    if(!['localhost','127.0.0.1'].includes(target.hostname)||target.pathname!=='/personnel_qa')throw Error('Disposable local personnel_qa only');
    db=new PrismaClient({datasourceUrl:url});
    await db.$executeRawUnsafe('TRUNCATE TABLE "Employee", "FileObject" CASCADE');
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS "EmployeeDocument"');
    employeeId=(await db.employee.create({data:{name:'FIXTURE',role:'OTHER'}})).id;
    otherId=(await db.employee.create({data:{name:'OTHER FIXTURE',role:'OTHER'}})).id;
    const file=(category:string)=>db.fileObject.create({data:{entityType:'EMPLOYEE',entityId:employeeId,category,fileType:category,storageKey:'https://fixture.invalid/'+randomUUID(),objectKey:'unchanged/'+randomUUID(),createdBy:'fixture'}});
    document=await file('CEDULA');evidence=await file('EVIDENCIA_WHATSAPP');ambiguous=await file('OTRO');
    const report=await db.whatsappReport.create({data:{employeeId,kind:'DAMAGE',description:'Fixture only',occurredAt:new Date(),sourceMessageId:randomUUID()}});
    await db.whatsappReportEvidence.create({data:{reportId:report.id,fileObjectId:ambiguous.id}});
    before=await db.fileObject.findMany({orderBy:{id:'asc'}});
    const sql=readFileSync(resolve(__dirname,'../../prisma/migrations/20261119230000_employee_document_separation/migration.sql'),'utf8');
    await db.$transaction(async tx=>{for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement)});
  });
  afterAll(async()=>{await db?.$disconnect()});
  it('backfills only personnel records and preserves original files, keys and report evidence',async()=>{
    expect(await db.fileObject.findMany({orderBy:{id:'asc'}})).toEqual(before);
    expect(await db.employeeDocument.findMany()).toEqual([expect.objectContaining({employeeId,fileObjectId:document.id})]);
    expect(await db.whatsappReportEvidence.count({where:{fileObjectId:ambiguous.id}})).toBe(1);
  });
  it('enforces real ownership in list and rejects direct operational evidence downloads',async()=>{
    const portal=new EmployeeDocumentsService(db as any,{ownEmployeeId:async()=>employeeId} as any);
    expect((await portal.documents('fixture')).map(x=>x.id)).toEqual([document.id]);
    await expect(portal.document('fixture',evidence.id)).rejects.toThrow('Documento no encontrado');
    await expect(portal.document('fixture',ambiguous.id)).rejects.toThrow('Documento no encontrado');
    const other=new EmployeeDocumentsService(db as any,{ownEmployeeId:async()=>otherId} as any);
    expect(await other.documents('fixture')).toEqual([]);
    await expect(other.document('fixture',document.id)).rejects.toThrow('Documento no encontrado');
  });
  it('creates new personnel metadata and relation atomically, with one relation per file',async()=>{
    const created=await db.fileObject.create({data:{entityType:'EMPLOYEE',entityId:employeeId,category:'EPS',fileType:'EPS',storageKey:'fixture',createdBy:'fixture',employeeDocument:{create:{employeeId}}}});
    expect(await db.employeeDocument.findUnique({where:{fileObjectId:created.id}})).toMatchObject({employeeId});
    await expect(db.employeeDocument.create({data:{employeeId:otherId,fileObjectId:created.id}})).rejects.toThrow();
    await expect(db.employeeDocument.create({data:{employeeId:'missing',fileObjectId:randomUUID()}})).rejects.toThrow();
    await db.fileObject.delete({where:{id:created.id}});
    expect(await db.employeeDocument.findUnique({where:{fileObjectId:created.id}})).toBeNull();
    expect(await db.fileObject.findUnique({where:{id:evidence.id}})).not.toBeNull();
  });
});
