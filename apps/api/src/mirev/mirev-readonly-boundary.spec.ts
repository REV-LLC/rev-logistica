import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MiRevModule } from './mirev.module';
import { PrismaService } from '../prisma/prisma.service';
describe('MiREV has no affiliation management surface',()=>{
 it('does not expose office routes even with an authorization header',async()=>{
  const module=await Test.createTestingModule({imports:[MiRevModule]}).overrideProvider(PrismaService).useValue({}).compile();
  const app=module.createNestApplication();await app.init();
  try{
   for(const path of ['/employee-portal/office/employees','/employee-portal/office/affiliation-providers']){
    await request(app.getHttpServer()).get(path).set('Authorization','Bearer any-header').expect(404);
    await request(app.getHttpServer()).post(path).set('Authorization','Bearer any-header').send({kind:'EPS',name:'not-created'}).expect(404);
   }
  }finally{await app.close()}
 });
});
