import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { EmployeeDocumentsController } from '../employee-portal/employee-documents.controller';
import { EmployeeDocumentsService } from '../employee-portal/employee-documents.service';
import { EmployeesService } from '../transport/employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DocumentCustomerEmailsService } from '../document-emails/document-customer-emails.service';
import { DocumentPdfSnapshotService } from '../documents/document-pdf-snapshot.service';

describe('employee documents: real JWT, upload, ownership and filename',()=>{
  let app:any,jwt:JwtService,rows:any[],objects:Map<string,Buffer>,s3:any;
  const own=randomUUID(),other=randomUUID(),users:any={office:{active:true,role:'OFFICE',employee:{id:own,active:true}},driver:{active:true,role:'DRIVER',employee:{id:own,active:true}},employee:{active:true,role:'EMPLOYEE',employee:{id:own,active:true}}};
  const db:any={user:{findUnique:jest.fn(({where})=>users[where.id])},employee:{findUnique:jest.fn(({where})=>({id:where.id,name:'SAMUEL',lastName:'GUERRERO',active:true}))},customer:{findUnique:jest.fn(()=>({id:'customer'}))},fileObject:{create:jest.fn(({data})=>{const row={id:randomUUID(),...data};rows.push(row);return row}),findMany:jest.fn(({where})=>rows.filter(r=>r.entityType===where.entityType&&r.entityId===where.entityId&&(!where.employeeDocument||r.employeeDocument?.create?.employeeId===where.employeeDocument.is.employeeId))),findFirst:jest.fn(({where})=>rows.find(r=>r.id===where.id&&r.entityType===where.entityType&&r.entityId===where.entityId&&(!where.employeeDocument||r.employeeDocument?.create?.employeeId===where.employeeDocument.is.employeeId))),findUnique:jest.fn(({where})=>rows.find(r=>r.id===where.id))}};
  const token=(who:string)=>jwt.sign({sub:who,role:users[who].role},{expiresIn:'5m'});
  const beforeEnv={...process.env};
  beforeAll(async()=>{
    Object.assign(process.env,{R2_ACCOUNT_ID:'fixture',R2_ACCESS_KEY_ID:'fixture',R2_SECRET_ACCESS_KEY:'fixture',R2_BUCKET:'fixture',R2_PUBLIC_BASE_URL:'https://files.fixture.invalid',AUTH_BYPASS_LOCAL:'false',AUTH_BYPASS_ENABLED:'false'});
    s3=jest.spyOn(S3Client.prototype,'send').mockImplementation(async(command:any)=>{
      if(command instanceof PutObjectCommand){objects.set(command.input.Key,Buffer.from(command.input.Body));return {} as any;}
      const bytes=objects.get(command.input.Key);const body:any=Readable.from(bytes||Buffer.alloc(0));body.transformToByteArray=async()=>bytes;return{Body:body,ContentType:'application/pdf'} as any;
    });
    const mod=await Test.createTestingModule({imports:[JwtModule.register({secret:'test-documents-isolated'})],controllers:[FilesController,EmployeeDocumentsController],providers:[FilesService,EmployeeDocumentsService,EmployeesService,JwtAuthGuard,RolesGuard,{provide:PrismaService,useValue:db},{provide:DocumentCustomerEmailsService,useValue:{}},{provide:DocumentPdfSnapshotService,useValue:{}}]}).compile();
    jwt=mod.get(JwtService);app=mod.createNestApplication();await app.init();
  });
  beforeEach(()=>{rows=[];objects=new Map();jest.clearAllMocks()});
  afterAll(async()=>{await app.close();s3.mockRestore();process.env=beforeEnv});
  async function upload(){return request(app.getHttpServer()).post(`/files/entities/EMPLOYEE/${own}`).set('Authorization','Bearer '+token('office')).field('category','CEDULA').field('displayName','ignored-custom-name').attach('files',Buffer.from('%PDF-1.7\nTEST FIXTURE'),{filename:'x.pdf',contentType:'application/pdf'}).expect(201)}
  it('lists Planilla and persists uploads as personal documents without EPS/ARL recognition',async()=>{
    const categories=await request(app.getHttpServer()).get('/files/categories/EMPLOYEE').set('Authorization','Bearer '+token('office')).expect(200);
    expect(categories.body).toContainEqual({value:'PLANILLA',label:'Planilla'});
    const result=await request(app.getHttpServer()).post(`/files/entities/EMPLOYEE/${own}`).set('Authorization','Bearer '+token('office')).field('category','planilla').attach('files',Buffer.from('%PDF-1.7\nTEST FIXTURE'),{filename:'planilla.pdf',contentType:'application/pdf'}).expect(201);
    expect(result.body.files[0]).toMatchObject({category:'PLANILLA',fileType:'PLANILLA',displayName:'samuel_guerrero_planilla.pdf'});
    expect(rows[0].employeeDocument).toEqual({create:{employeeId:own}});
    const listed=await request(app.getHttpServer()).get('/employee-portal/documents').set('Authorization','Bearer '+token('employee')).expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({id:result.body.files[0].id,category:'PLANILLA'});
  });
  it('renames using the employee name from DB, preserves original metadata and prevents overwrites',async()=>{
    const a=await upload(),b=await upload();
    expect(a.body.files[0]).toMatchObject({displayName:'samuel_guerrero_cedula.pdf',originalName:'x.pdf',category:'CEDULA'});
    expect(a.body.files[0].objectKey).toMatch(/\/samuel_guerrero_cedula\.pdf$/);
    expect(a.body.files[0].objectKey).not.toEqual(b.body.files[0].objectKey);
    expect(objects.size).toBe(2);
    expect(a.body.files[0].objectKey).toMatch(/^employee-documents\//);
    expect(rows[0].employeeDocument).toEqual({create:{employeeId:own}});
  });
  it('lets an employee list and download only its own documents, ignoring forged employee IDs',async()=>{
    const uploadResult=await upload();const id=uploadResult.body.files[0].id;
    rows.push({id:randomUUID(),entityType:'EMPLOYEE',entityId:other,displayName:'other.pdf'});
    const list=await request(app.getHttpServer()).get(`/employee-portal/documents?employeeId=${other}`).set('Authorization','Bearer '+token('employee')).expect(200);
    expect(list.body).toHaveLength(1);expect(list.body[0].id).toBe(id);
    const download=await request(app.getHttpServer()).get(`/employee-portal/documents/${id}/download`).set('Authorization','Bearer '+token('employee')).expect(200);
    expect(download.headers['content-disposition']).toContain('samuel_guerrero_cedula.pdf');
    expect(download.headers['cache-control']).toContain('no-store');
    await request(app.getHttpServer()).get(`/employee-portal/documents/${rows[1].id}/download`).set('Authorization','Bearer '+token('employee')).expect(404);
  });
  it('keeps operational evidence out of personnel lists and rejects its direct document download',async()=>{
    const uploaded=await upload();
    const evidence={id:randomUUID(),entityType:'EMPLOYEE',entityId:own,category:'EVIDENCIA_WHATSAPP',displayName:'operational.jpg'};
    rows.push(evidence);
    for(const path of ['/employee-portal/documents',`/files/entities/EMPLOYEE/${own}`]){
      const result=await request(app.getHttpServer()).get(path).set('Authorization','Bearer '+token(path.startsWith('/files')?'office':'employee')).expect(200);
      expect(result.body.map((item:any)=>item.id)).toEqual([uploaded.body.files[0].id]);
    }
    await request(app.getHttpServer()).get(`/employee-portal/documents/${evidence.id}/download`).set('Authorization','Bearer '+token('employee')).expect(404);
    expect(rows).toContainEqual(evidence);
  });
  it('queues EPS recognition atomically with the personal document and keeps its source file ID',async()=>{
    const result=await request(app.getHttpServer()).post(`/files/entities/EMPLOYEE/${own}`).set('Authorization','Bearer '+token('office')).field('category','EPS').attach('files',Buffer.from('%PDF-1.7\nFIXTURE'),{filename:'certificate.pdf',contentType:'application/pdf'}).expect(201);
    expect(rows[0].employeeDocument.create.affiliationRecognition.create).toEqual({employeeId:own,sourceFileObjectId:result.body.files[0].id,kind:'EPS',expectedProviderId:null});
  });
  it('blocks access to another employee via generic file endpoints and blocks employee uploads',async()=>{
    await request(app.getHttpServer()).get(`/files/entities/EMPLOYEE/${other}`).set('Authorization','Bearer '+token('driver')).expect(403);
    await request(app.getHttpServer()).post(`/files/entities/EMPLOYEE/${own}`).set('Authorization','Bearer '+token('employee')).expect(401);
    await request(app.getHttpServer()).get('/employee-portal/documents').expect(401);
  });
});
