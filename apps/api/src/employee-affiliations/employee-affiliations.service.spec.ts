import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { affiliationName, EmployeeAffiliationsService } from './employee-affiliations.service';
const epsId='232876dc-e4fa-4c94-9a86-a2812fbdf6ee', arlId='f5f78410-475c-4d86-a233-239791492b91';
describe('employee affiliation catalog', () => {
  let db: any, service: EmployeeAffiliationsService;
  beforeEach(()=>{
    db={user:{findUnique:jest.fn().mockResolvedValue({role:Role.OFFICE,active:true})},employee:{findUnique:jest.fn().mockResolvedValue({active:true,epsId:null,arlId:null}),update:jest.fn(),updateMany:jest.fn(),findMany:jest.fn()},employeeAffiliationProvider:{findUnique:jest.fn(({where})=>Promise.resolve(where.id===epsId?{id:epsId,kind:'EPS',name:'Sanitas',active:true}:{id:arlId,kind:'ARL',name:'Sura',active:true})),create:jest.fn(),update:jest.fn(),findMany:jest.fn()},$queryRaw:jest.fn()};
    db.$transaction=async(fn:any)=>fn(db); service=new EmployeeAffiliationsService(db);
  });
  it('normalizes case and spacing for duplicate protection',()=>{
    expect(affiliationName('  Nueva   EPS ')).toEqual({name:'Nueva EPS',normalizedName:'nueva eps'});
    expect(()=>affiliationName('')).toThrow(BadRequestException);
  });
  it.each([Role.EMPLOYEE,Role.DRIVER,Role.OPERATOR])('denies catalog changes and assignments for %s',async role=>{
    db.user.findUnique.mockResolvedValue({role,active:true});
    await expect(service.create('user',{kind:'EPS',name:'Name'})).rejects.toThrow(ForbiddenException);
    await expect(service.assign('user','employee',{epsId,arlId})).rejects.toThrow(ForbiddenException);
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('denies an inactive office account',async()=>{
    db.user.findUnique.mockResolvedValue({role:Role.OFFICE,active:false});
    await expect(service.catalog('user')).rejects.toThrow(ForbiddenException);
  });
  it('stores selected IDs and canonical names; ignores forged names',async()=>{
    await service.assign('office','employee',{epsId,arlId,eps:'Forged'} as any);
    expect(db.employee.update).toHaveBeenCalledWith({where:{id:'employee'},data:{epsId,arlId,eps:'Sanitas',arl:'Sura'},select:expect.any(Object)});
  });
  it('requires explicit IDs or null and never silently clears legacy text submissions',async()=>{
    await expect(service.assign('office','employee',{eps:'Name',arl:'Name'} as any)).rejects.toThrow(BadRequestException);
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('rejects an ARL in the EPS field',async()=>{
    await expect(service.assign('office','employee',{epsId:arlId,arlId:null})).rejects.toThrow(BadRequestException);
    expect(db.employee.update).not.toHaveBeenCalled();
  });
  it('rejects nonexistent provider IDs',async()=>{
    db.employeeAffiliationProvider.findUnique.mockResolvedValue(null);
    await expect(service.assign('office','employee',{epsId,arlId:null})).rejects.toThrow(BadRequestException);
  });
  it('rejects a new inactive assignment but preserves an existing inactive affiliation',async()=>{
    db.employeeAffiliationProvider.findUnique.mockResolvedValue({id:epsId,kind:'EPS',name:'Sanitas',active:false});
    await expect(service.assign('office','employee',{epsId,arlId:null})).rejects.toThrow(BadRequestException);
    db.employee.findUnique.mockResolvedValue({active:true,epsId,arlId:null});
    await service.assign('office','employee',{epsId,arlId:null});
    expect(db.employee.update).toHaveBeenCalledTimes(1);
  });
  it('renames linked employee display values without rewriting medical history',async()=>{
    db.employeeAffiliationProvider.update.mockResolvedValue({id:epsId,kind:'EPS',name:'New name',active:true});
    await service.update('office',epsId,{name:'New name',active:true});
    expect(db.employee.updateMany).toHaveBeenCalledWith({where:{epsId},data:{eps:'New name'}});
  });
  it('allows clearing an affiliation explicitly',async()=>{
    await service.assign('office','employee',{epsId:null,arlId:null});
    expect(db.employee.update.mock.calls[0][0].data).toEqual({epsId:null,arlId:null,eps:null,arl:null});
  });
});
