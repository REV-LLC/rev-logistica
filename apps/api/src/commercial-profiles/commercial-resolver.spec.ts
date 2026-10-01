import {resolveCommercialMode} from './commercial-resolver';
import {profileSchema,type CommercialMode,type CompositionPart} from './commercial-profile.input';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const mode=(unit:'DAY'|'HOUR'|'METER',present?:boolean):CommercialMode=>({id:uuid(unit==='DAY'?1:2),name:'Modalidad libre sin nombres especiales',unit,minimum:{value:unit==='DAY'?'3':'40',basis:unit==='HOUR'?'PER_REPORTED_DAY':'PER_RENTAL'},pricing:{source:'FIXED',amount:'100'},conditions:present===undefined?[]:[{groupId:uuid(3),presence:present?'PRESENT':'ABSENT',minimumQuantity:1}],parts:[{groupId:uuid(3),treatment:'INCLUDED'}]});
const part:CompositionPart={documentItemId:uuid(4),parentAssetId:uuid(5),accessoryId:uuid(6),label:'Cualquier implemento',quantity:1};
const profile={id:uuid(7),version:1,effectiveFrom:'2026-09-30',groups:[{id:uuid(3),name:'Grupo libre',selectors:[{kind:'ACCESSORY' as const,id:uuid(6)}]}],modes:[mode('DAY',false),mode('METER',true)]};
describe('generic commercial profiles',()=>{
 it('new arbitrary equipment switches days/meters solely from IDs',()=>{
  expect(resolveCommercialMode(profile,[],{unit:'DAY',price:'300'}).mode?.unit).toBe('DAY');
  const result=resolveCommercialMode(profile,[part],{unit:'DAY',price:'300'});
  expect(result.mode?.unit).toBe('METER');expect(result.basePrice).toBe('100');expect(result.parts[0].treatment).toBe('INCLUDED');
 });
 it('renaming an accessory cannot affect billing; a different ID cannot trigger it',()=>{
  expect(resolveCommercialMode(profile,[{...part,label:'Otro nombre'}],{unit:'DAY',price:'0'}).mode?.unit).toBe('METER');
  expect(resolveCommercialMode(profile,[{...part,accessoryId:uuid(99)}],{unit:'DAY',price:'0'}).status).toBe('REVIEW');
 });
 it('does not add coinciding modes or convert catalog rates across units',()=>{
  expect(resolveCommercialMode({...profile,modes:[mode('DAY'),mode('METER')]},[],{unit:'DAY',price:'10'}).status).toBe('REVIEW');
  const result=resolveCommercialMode({...profile,modes:[{...mode('METER'),pricing:{source:'CATALOG'}}]},[],{unit:'DAY',price:'10'});
  expect(result.status).toBe('REVIEW');
 });
 it('zero price is valid, inclusion is contextual, and no missing treatment becomes free',()=>{
  const zero={...mode('DAY'),pricing:{source:'FIXED' as const,amount:'0'}};
  expect(resolveCommercialMode({...profile,modes:[zero]},[part],{unit:'DAY',price:'10'}).basePrice).toBe('0');
  expect(resolveCommercialMode({...profile,modes:[{...zero,parts:[]}]},[part],{unit:'DAY',price:'10'}).status).toBe('REVIEW');
  expect(resolveCommercialMode({...profile,modes:[{...zero,parts:[{groupId:uuid(3),treatment:'INDEPENDENT'}]}]},[part],{unit:'DAY',price:'10'}).parts[0].treatment).toBe('INDEPENDENT');
 });
 it('rejects unknown groups and incompatible minimum units',()=>{
  const dto={scopeType:'ASSET',scopeId:uuid(5),expectedVersion:0,effectiveFrom:'2026-09-30',groups:profile.groups,modes:profile.modes};
  expect(profileSchema.safeParse(dto).success).toBe(true);
  expect(profileSchema.safeParse({...dto,groups:[]}).success).toBe(false);
  expect(profileSchema.safeParse({...dto,modes:[{...mode('DAY'),minimum:{value:'3',basis:'PER_REPORTED_DAY'}}]}).success).toBe(false);
 });
});
