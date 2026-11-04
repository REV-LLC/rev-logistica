import { applyCustomerPricing, customerPricingKey, customerPricingSchema } from './annex-customer-pricing';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
const skuId='550b304a-e782-4dd8-bfc2-87c90f7f8f8c';
const rental=():AnnexInput['rentals'][number]=>({id:'lot',skuId,label:'Panel cualquiera',quantity:'10',billingAreaM2:'0.72',deliveredOn:'2026-10-01',source:{reference:'rem',origin:'INVENTORY'},pricing:{basePrice:'3000'},returns:[],waivedDays:[]});
const agreement={version:1,rates:[{skuId,quantityBasis:'AREA_M2',unitPrice:'2750'}]};
describe('customer annex pricing',()=>{
 it('uses a customer-scoped key and does not affect clients without an agreement',()=>{
  expect(customerPricingKey('a')).not.toBe(customerPricingKey('b'));
  const r=rental();applyCustomerPricing([r],null);expect(r.pricing).toEqual({basePrice:'3000'});
 });
 it('keeps the catalog base and applies the exact agreed rate per m²',()=>{
  const r=rental();applyCustomerPricing([r],agreement);
  expect(r.pricing).toEqual({basePrice:'3000.00',effectivePrice:'2750.00',adjustmentReason:'Tarifa acordada para el cliente',adjustmentSource:'CUSTOMER'});
  const input:AnnexInput={period:{from:'2026-10-01',to:'2026-10-15',through:'2026-10-15'},policy:{version:'test',includeReturnDay:true,excludedWeekdays:[],excludeHolidays:false,holidays:[],holidayCalendarConfirmed:true,minimumHoursPerMachineDay:'6'},rentals:[r],machineDays:[]};
  expect(calculateAnnex(input).totals).toEqual({rentalGross:'324000.00',rentalDiscount:'27000.00',rentalNet:'297000.00'});
 });
 it('does not apply an area rate to unit billing or another SKU',()=>{
  const unit={...rental(),billingAreaM2:undefined};const other={...rental(),skuId:'other'};
  applyCustomerPricing([unit,other],agreement);expect(unit.pricing).toEqual({basePrice:'3000'});expect(other.pricing).toEqual({basePrice:'3000'});
 });
 it('honors zero agreements and explicit rates when catalog price is absent',()=>{
  const r=rental();r.pricing.basePrice='0';applyCustomerPricing([r],agreement);expect(r.pricing.basePrice).toBe('2750.00');
  applyCustomerPricing([r],{version:1,rates:[{...agreement.rates[0],unitPrice:'0'}]});expect(r.pricing.effectivePrice).toBe('0.00');
 });
 it('does not rewrite included pieces or documentary commercial agreements',()=>{
  const r=rental();r.commercial={status:'RESOLVED'} as never;applyCustomerPricing([r],agreement);expect(r.pricing).toEqual({basePrice:'3000'});
 });
 it('rejects duplicate or invalid configuration rather than silently changing a charge',()=>{
  expect(customerPricingSchema.safeParse({version:1,rates:[...agreement.rates,...agreement.rates]}).success).toBe(false);
  expect(()=>applyCustomerPricing([rental()],{version:1,rates:[{...agreement.rates[0],unitPrice:'-1'}]})).toThrow();
 });
 it('resolves the latest explicit decision per unit basis, including zero and returning to the customer rate',()=>{
  const cut = (unitPrice: string | null) => ({worksiteRates:[{skuId, quantityBasis:'AREA_M2' as const, unitPrice}]});
  const priceWith = (...cuts: ReturnType<typeof cut>[]) => {
    const r = rental();
    applyCustomerPricing([r], agreement, [{}, ...cuts]);
    return r.pricing;
  };
  expect(priceWith(cut('3500.25'))).toMatchObject({basePrice:'3500.25',effectivePrice:'3500.25',adjustmentSource:'WORKSITE'});
  expect(priceWith(cut('0'), cut('3500.25')).effectivePrice).toBe('0.00');
  expect(priceWith(cut(null), cut('3500.25'))).toMatchObject({effectivePrice:'2750.00',adjustmentSource:'CUSTOMER'});
  const unit = {...rental(), billingAreaM2: undefined};
  applyCustomerPricing([unit], agreement, [cut('3500.25')]);
  expect(unit.pricing).toEqual({basePrice:'3000'});
  const included = {...rental(),includedIn:{assetId:'asset',label:'Equipo',documentItemId:'item'}};
  applyCustomerPricing([included], agreement, [cut('3500.25')]);
  expect(included.pricing).toEqual({basePrice:'3000'});
 });
 it('carries the last table edit, including zero, ahead of differing lot prices on older revisions',()=>{
  const old = rental();
  old.pricing = {basePrice:'3000',effectivePrice:'1800',adjustmentSource:'MANUAL'};
  const earlier = {rentals:[old]};
  const rule = {skuId,quantityBasis:'AREA_M2' as const,unitPrice:null};
  const apply = (cut: Parameters<typeof applyCustomerPricing>[2], saved: ReturnType<typeof rental>[] = []) => {
    const next = rental();
    applyCustomerPricing([next], agreement, cut, saved);
    return next.pricing;
  };
  expect(apply([{},earlier]).effectivePrice).toBe('1800.00');
  const other = {...old, id:'second', pricing:{...old.pricing,effectivePrice:'2000'}};
  expect(apply([{rentals:[old,other]}]).effectivePrice).toBe('2750.00');
  const last = {worksiteRates:[{...rule,tablePrice:{basePrice:'3000',effectivePrice:'0'}}],rentals:[old,other]};
  expect(apply([last, earlier]).effectivePrice).toBe('0.00');
  expect(apply([{worksiteRates:[{...rule,thisCutOnly:true}],rentals:[other]},earlier]).effectivePrice).toBe('1800.00');
  expect(apply([{worksiteRates:[rule],rentals:[other]},earlier]).effectivePrice).toBe('2750.00');
  expect(apply([last], [rental()]).effectivePrice).toBe('2750.00');
  const saved = rental();
  saved.pricing = {basePrice:'3000',effectivePrice:'2200',adjustmentSource:'WORKSITE'};
  expect(apply([last], [saved])).toEqual(saved.pricing);
 });
 it('retains sub-cent discounted unit rates without changing multi-day totals',()=>{
  const old = rental();
  old.pricing = {basePrice:'3.33',discountPercent:'12.5',adjustmentSource:'MANUAL'};
  const next = rental();
  applyCustomerPricing([next], null, [{rentals:[old]}]);
  const period = {from:'2026-10-01',to:'2026-10-15',through:'2026-10-15'};
  const amounts = (row: typeof old) => calculateAnnex({period,policy:{version:'test',minimumHoursPerMachineDay:'6',
    includeReturnDay:true,excludeHolidays:false,holidays:[],excludedWeekdays:[],holidayCalendarConfirmed:true},rentals:[row],machineDays:[]});
  expect(amounts(next).lines[0].effectivePrice).toBe('2.913750000000');
  expect(amounts(next).totals.rentalNet).toBe(amounts(old).totals.rentalNet);
 });
});
