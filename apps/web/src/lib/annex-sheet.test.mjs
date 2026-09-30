import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetRows, applySheetChanges, groupMachineRows } from './annex-sheet.ts';
const input = {
 period:{from:'2026-09-16',to:'2026-09-30',through:'2026-09-20'},
 rentals:[{id:'lot',label:'Plataforma',quantity:'3',deliveredOn:'2026-09-16',source:{reference:'REM-1'},pricing:{basePrice:'100'},returns:[],waivedDays:[]}],
 machineDays:[{assetId:'machine',label:'CASE',date:'2026-09-16',status:'PENDING',reports:[],pricing:{basePrice:'80000'}}],
};
const line = (date, quantity, net='0.10')=>({key:`lot:${date}`,kind:'DAY',date,label:'Plataforma',quantity,net,discountPercent:'0',effectivePrice:'100',waived:false,reason:null});
const result = {lines:[line('2026-09-16','3'),line('2026-09-17','3'),line('2026-09-18','2'),line('2026-09-20','2')]};
test('v2 conserva accesorios con tarifa cero como filas visibles del anexo',()=>{
 const zeroInput={...input,machineDays:[],rentals:[{...input.rentals[0],accessoryId:'part',pricing:{basePrice:'0'},
  commercial:{schemaVersion:2,status:'RESOLVED',contextualZero:true,parentDocumentItemId:'parent',parts:[]}}]};
 const rows=sheetRows(zeroInput,{lines:[{...line('2026-09-16','3','0.00'),basePrice:'0',effectivePrice:'0'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].accessoryId,'part');
 assert.equal(rows[0].net,'0.00');assert.equal(rows[0].status,'Tarifa $0 en este conjunto');
});
test('consecutive days group, partial returns and excluded gaps split; exact cents',()=>{
 const rows=sheetRows(input,result);assert.equal(rows.length,4);
 assert.deepEqual(rows.slice(0,3).map(r=>[r.from,r.to,r.days,r.quantity,r.net]),[
 ['2026-09-16','2026-09-17','2','3','0.20'],['2026-09-18','2026-09-18','1','2','0.10'],['2026-09-20','2026-09-20','1','2','0.10']]);
 assert.equal(rows[3].status,'Falta reporte');assert.equal(rows[3].net,'');
});
test('source mapping works in filtered order, does not edit other sources',()=>{
 const row=sheetRows(input,result)[3];
 const next=applySheetChanges(input,[{row,key:'discountPercent',value:'10,5'}],'Acuerdo');
 assert.equal(next.machineDays[0].pricing.discountPercent,'10.5');assert.equal(next.rentals[0].pricing.discountPercent,undefined);
 assert.equal(input.machineDays[0].pricing.discountPercent,undefined);
});
test('price replaces percent, keeps base and preserves report and inventory sources',()=>{
 const row=sheetRows(input,result)[0];
 const discounted=applySheetChanges(input,[{row,key:'discountPercent',value:'10'}],'Acuerdo');
 const next=applySheetChanges(discounted,[{row,key:'effectivePrice',value:'80'}],'');
 assert.deepEqual(next.rentals[0].pricing,{basePrice:'100',effectivePrice:'80',adjustmentReason:'Acuerdo'});
 assert.deepEqual(next.rentals[0].source,input.rentals[0].source);
});
test('protected cells, invalid numbers and conflicting segments reject whole batch',()=>{
 const rows=sheetRows(input,result), before=JSON.stringify(input);
 for (const [key,value] of [['basePrice','99'],['discountPercent','101'],['effectivePrice','101'],['effectivePrice','=1+2'],['discountPercent','-1']]) {
   assert.throws(()=>applySheetChanges(input,[{row:rows[0],key:'discountPercent',value:'10'},{row:rows[1],key,value}],'Acuerdo'));
 }
 assert.equal(JSON.stringify(input),before);
 assert.throws(()=>applySheetChanges(input,[{row:rows[0],key:'discountPercent',value:'10'},{row:rows[1],key:'discountPercent',value:'20'}],'Acuerdo'));

});

test('editing and pasting discounts needs no reason; effective price works too',()=>{
 const rows=sheetRows(input,result);
 const next=applySheetChanges(input,[{row:rows[0],key:'discountPercent',value:'10'},{row:rows[3],key:'discountPercent',value:'20'}]);
 assert.deepEqual(next.rentals[0].pricing,{basePrice:'100',discountPercent:'10'});
 assert.deepEqual(next.machineDays[0].pricing,{basePrice:'80000',discountPercent:'20'});
 const priced=applySheetChanges(next,[{row:rows[0],key:'effectivePrice',value:'80'}]);
 assert.deepEqual(priced.rentals[0].pricing,{basePrice:'100',effectivePrice:'80'});
});

test('clearing a discount restores zero and removes a previous effective price',()=>{
 const row=sheetRows(input,result)[0];
 const discounted=applySheetChanges(input,[{row,key:'discountPercent',value:'15'}]);
 for(const value of ['', '   ']) {
  const cleared=applySheetChanges(discounted,[{row,key:'discountPercent',value}]);
  assert.deepEqual(cleared.rentals[0].pricing,{basePrice:'100',discountPercent:'0'});
 }
 const priced=applySheetChanges(input,[{row,key:'effectivePrice',value:'85'}]);
 assert.deepEqual(applySheetChanges(priced,[{row,key:'discountPercent',value:''}]).rentals[0].pricing,{basePrice:'100',discountPercent:'0'});
 assert.deepEqual(applySheetChanges(input,[{row,key:'effectivePrice',value:''}]).rentals[0].pricing,{basePrice:'100',effectivePrice:'0'});
});

test('all editable numeric columns normalize blanks in multirow paste',()=>{
 const rows=sheetRows(input,result);
 for (const key of ['discountPercent','effectivePrice']) {
  const updated=applySheetChanges(input,[{row:rows[0],key,value:''},{row:rows[1],key,value:'0'},{row:rows[3],key,value:'  '}]);
  assert.equal(updated.rentals[0].pricing[key],'0');
  assert.equal(updated.machineDays[0].pricing[key],'0');
 }
});

test('machine groups use asset identity, chronological days and protected titles',()=>{
 const source=structuredClone(input);
 source.machineDays.push({...source.machineDays[0],date:'2026-09-18'});
 source.machineDays.push({...source.machineDays[0],assetId:'another'});
 const rows=sheetRows(source,null).reverse();
 const grouped=groupMachineRows(source,rows);
 const headers=grouped.filter(row=>row.group);
 assert.equal(headers.length,2);
 assert.equal(headers[0].label,headers[1].label);
 const first=grouped.findIndex(row=>row.id==='machine-group:machine');
 assert.deepEqual(grouped.slice(first+1,first+3).map(r=>r.from),['2026-09-16','2026-09-18']);
 assert.throws(()=>applySheetChanges(source,[{row:headers[0],key:'discountPercent',value:'5'}]),/título/);
});

test('day adjustments preserve dates, pricing and movements and can return to automatic days',()=>{
 const row=sheetRows(input,result)[0];
 const next=applySheetChanges(input,[{row,key:'days',value:'3'}]);
 assert.deepEqual(next.rentals[0].dayAdjustments,[{from:'2026-09-16',to:'2026-09-17',quantity:'3',days:3}]);
 assert.deepEqual(next.rentals[0].returns,input.rentals[0].returns);
 assert.deepEqual(next.rentals[0].pricing,input.rentals[0].pricing);
 assert.equal(next.rentals[0].deliveredOn,input.rentals[0].deliveredOn);
 assert.deepEqual(applySheetChanges(next,[{row,key:'days',value:'2'}]).rentals[0].dayAdjustments,[]);
 assert.equal(applySheetChanges(next,[{row,key:'days',value:''}]).rentals[0].dayAdjustments[0].days,0);
 for(const value of ['-1','1.5','1000','=2']) assert.throws(()=>applySheetChanges(input,[{row,key:'days',value}]));
 assert.throws(()=>applySheetChanges(input,[{row:sheetRows(input,result)[3],key:'days',value:'2'}]));
});
test('adjusted days stay in one span despite zero or extra billable units; new days remain automatic',()=>{
 const row=sheetRows(input,result)[0];
 for(const days of [0,1,3]) {
  const next=applySheetChanges(input,[{row,key:'days',value:String(days)}]);
  const lines=[{...line('2026-09-16','3',days?'100.00':'0.00'),billableUnits:String(Math.min(1,days))},
    {...line('2026-09-17','3',days>1?'200.00':'0.00'),billableUnits:String(Math.max(0,days-1))},
    {...line('2026-09-18','3','100.00'),billableUnits:'1'}];
  const rows=sheetRows(next,{lines});
  assert.equal(rows[0].from,'2026-09-16');assert.equal(rows[0].to,'2026-09-17');assert.equal(rows[0].days,String(days));
  assert.equal(rows[1].from,'2026-09-18');assert.equal(rows[1].days,'1');
 }
});

test('daily minimum supplement stays separate and cannot be edited as physical days',()=>{
 const daily=structuredClone(input);daily.policy={minimumDaysBySku:{sku:10}};daily.rentals[0].skuId='sku';
 const calculated={lines:[line('2026-09-16','3','300.00'),{...line('2026-09-16','1','900.00'),key:'lot:minimum:2026-09-16',billableUnits:'9',reason:'Completa el mínimo de días del alquiler'}]};
 const rows=sheetRows(daily,calculated);
 assert.equal(rows[1].supplement,true);assert.notEqual(rows[0].id,rows[1].id);
 assert.throws(()=>applySheetChanges(daily,[{row:rows[1],key:'days',value:'8'}]));
 assert.equal(groupMachineRows(daily,rows)[0].group,true);
 assert.equal(groupMachineRows(daily,rows)[0].skuId,'sku');
});
test('meter rows use their own base price and discount; cannot edit days',()=>{
 const cutting=structuredClone(input);cutting.rentals[0].cutting={minimumMeters:'40',pricing:{basePrice:'2000'},reports:[]};
 const rows=sheetRows(cutting,{lines:[{...line('2026-09-16','1','80000.00'),kind:'METER',billableUnits:'40',reportedHours:'12',effectivePrice:'2000'}]});
 assert.equal(rows[0].mode,'M');assert.equal(rows[0].units,'40');assert.equal(rows[0].days,'—');assert.equal(rows[0].basePrice,'2000');
 const next=applySheetChanges(cutting,[{row:rows[0],key:'effectivePrice',value:'1800'}]);
 assert.equal(next.rentals[0].cutting.pricing.effectivePrice,'1800');assert.equal(next.rentals[0].pricing.basePrice,'100');
 assert.throws(()=>applySheetChanges(cutting,[{row:rows[0],key:'days',value:'1'}]));
});
