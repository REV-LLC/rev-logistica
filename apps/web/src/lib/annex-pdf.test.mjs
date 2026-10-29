import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
const { createAnnexPdf } = require('./annex-pdf.ts');
if (previousLoader) require.extensions['.ts'] = previousLoader;
else delete require.extensions['.ts'];
const logoUrl = `data:image/png;base64,${fs.readFileSync(new URL('../../public/branding/rev-logo.png', import.meta.url)).toString('base64')}`;
function fixture(count = 1, vatPercent = 19) {
  const rentals = Array.from({length: count}, (_, i) => ({
    id:`lot-${i}`, skuId:`sku-${i}`, label:`Equipo ${i}`, quantity:'1', deliveredOn:'2026-10-05',
    source:{origin:'INVENTORY', reference:`ledger-${i}`, documentId:`document-${i}`,documentNumber:`RM-${i}`},
    pricing:{basePrice:'100'}, returns:[], waivedDays:[],
  }));
  const lines = rentals.map(r => ({key:`${r.id}:2026-10-16`,kind:'DAY',date:'2026-10-16',label:r.label,quantity:'1',net:'100.00',discountPercent:'0',effectivePrice:'100',waived:false,reason:null}));
  return {input:{period:{from:'2026-10-16',to:'2026-10-31',through:'2026-10-16'},policy:{vatPercent},rentals,machineDays:[]},
    result:{lines,totals:{rentalGross:`${100*count}.00`,rentalDiscount:'0.00',rentalNet:`${100*count}.00`},issues:[]},
    customer:'Cliente de prueba',worksite:'Obra de prueba',revision:1,issues:[],branding:{companyName:'Empresa de prueba',logoUrl}};
}
async function inspect(blob) {
  const raw=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  const contents=[...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(match=>{
    try{return inflateSync(Buffer.from(match[1],'latin1')).toString('latin1')}catch{return match[1]}
  });
  return {raw,contents,text:contents.join('\n'),pages:(raw.match(/\/Type \/Page\b/g)||[]).length};
}
test('download contains company logo, FINGE, opening balance and exact VAT breakdown', async()=>{
  const pdf=await inspect(await createAnnexPdf(fixture()));
  assert.equal(pdf.pages,1);assert.match(pdf.raw,/\/Subtype \/Image/);
  for(const text of ['Empresa de prueba','FINGE','Saldo inicial','$ 100,00','$ 19,00','$ 119,00']) assert.ok(pdf.text.includes(text),text);
  assert.doesNotMatch(pdf.raw,/\/N \/Print/);
});
test('print uses the same document with zero VAT and requests print action',async()=>{
  const pdf=await inspect(await createAnnexPdf(fixture(1,0),{print:true}));
  assert.match(pdf.raw,/\/N \/Print/);assert.ok(pdf.text.includes('$ 0,00'));assert.ok(pdf.text.includes('$ 100,00'));
});
test('long annexes repeat company identity, FINGE and column headings on table pages',async()=>{
  const pdf=await inspect(await createAnnexPdf(fixture(80)));
  assert.ok(pdf.pages>1);
  const pages=pdf.contents.filter(content=>content.includes('FINGE'));
  assert.equal(pages.length,pdf.pages);
  for(const page of pages) { assert.ok(page.includes('Empresa de prueba'));assert.ok(page.includes('Cliente de prueba')); }
  for(const page of pages.filter(page=>page.includes('Equipo 1')||page.includes('Equipo 7'))) assert.ok(page.includes('Documento'));
  assert.ok(pdf.text.includes('Equipo 79'));assert.ok(pdf.text.includes('$ 9.520,00'));
});
test('current-period deliveries show document number instead of opening balance',async()=>{
  const data=fixture();data.input.rentals[0].deliveredOn='2026-10-16';
  const pdf=await inspect(await createAnnexPdf(data));assert.ok(pdf.text.includes('RM-0'));assert.ok(!pdf.text.includes('Saldo inicial'));
});
