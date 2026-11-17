const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.NODE_ENV='test';
process.env.JWT_SECRET='local-unit-test-secret-only-32-characters';
const {JwtAuthGuard}=require('../dist/src/auth/jwt-auth.guard');
const context=(path,method='GET')=>({switchToHttp:()=>({getRequest:()=>({path,method,headers:{authorization:'Bearer local-unit-test'}})})});
const guard=()=>new JwtAuthGuard({verifyAsync:async()=>({sub:'employee-user',role:'EMPLOYEE'})},{user:{findUnique:async()=>({active:true,role:'EMPLOYEE',employee:{active:true}})}});
test('employee profile reads work only in dedicated MiREV API',async()=>{
 process.env.MIREV_API_ONLY='true';
 for(const path of ['/employee-portal/profile','/employee-portal/loans','/employee-portal/activities','/settings/loan-display','/employees/11111111-1111-4111-8111-111111111111/photo']) assert.equal(await guard().canActivate(context(path)),true);
 for(const path of ['/employees','/users','/settings','/employee-portal/profile/other']) await assert.rejects(()=>guard().canActivate(context(path)));
 await assert.rejects(()=>guard().canActivate(context('/employee-portal/profile','POST')));
 delete process.env.MIREV_API_ONLY;
 await assert.rejects(()=>guard().canActivate(context('/employee-portal/profile')));
 assert.equal(await guard().canActivate(context('/attendance/me')),true);
});
test('inactive employees cannot read their portal',async()=>{
 process.env.MIREV_API_ONLY='true';
 const inactive=new JwtAuthGuard({verifyAsync:async()=>({sub:'x',role:'EMPLOYEE'})},{user:{findUnique:async()=>({active:true,role:'EMPLOYEE',employee:{active:false}})}});
 await assert.rejects(()=>inactive.canActivate(context('/employee-portal/profile')));
});
test('photo access always resolves the account employee, including admin sessions',async()=>{
 const {MiRevModule}=require('../dist/src/mirev/mirev.module');
 const MiRevPersonalController=Reflect.getMetadata('controllers',MiRevModule).find(c=>c.name==='MiRevPersonalController');
 let reads=0;
 const controller=new MiRevPersonalController({ownEmployeeId:async()=> 'own',getEmployeePhoto:async()=>{reads++;return {contentType:'image/jpeg',body:{pipe(){}}}}},{});
 await assert.rejects(()=>controller.photo('other',undefined,{user:{sub:'admin'}},{setHeader(){}}));
 assert.equal(reads,0);
 await controller.photo('own',undefined,{user:{sub:'user'}},{setHeader(){}});
 assert.equal(reads,1);
});
