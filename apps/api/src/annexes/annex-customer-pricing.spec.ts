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
  expect(r.pricing).toEqual({basePrice:'3000.00',effectivePrice:'2750.00',adjustmentReason:'Tarifa acordada para el cliente'});
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
});
