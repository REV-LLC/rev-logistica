import { dailyBillingStartsOn } from './annex-billing-start';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
const rule = { afterLocalTime: '12:01', timeZone: 'America/Bogota' as const };
const doc = (time: string) => ({ type: 'REMISSION', docDate: new Date(time), notes: `FECHA DOCUMENTO: ${time}` });
describe('daily rental commercial start', () => {
  it.each([
    ['2026-10-23T12:00:00-05:00', '2026-10-23'],
    ['2026-10-23T12:01:00-05:00', '2026-10-23'],
    ['2026-10-23T12:01:01-05:00', '2026-10-24'],
    ['2026-10-23T16:11:00-05:00', '2026-10-24'],
    ['2026-10-31T23:59:00-05:00', '2026-11-01'],
  ])('applies the configured local threshold to %s', (time, expected) => {
    expect(dailyBillingStartsOn(time.slice(0,10), doc(time), rule)).toBe(expected);
  });
  it('does not invent a time for date-only documents or an unconfigured company', () => {
    const source = doc('2026-10-23T21:30:00Z');
    expect(dailyBillingStartsOn('2026-10-23', {...source, notes:'FECHA DOCUMENTO: 2026-10-23'}, rule)).toBe('2026-10-23');
    expect(dailyBillingStartsOn('2026-10-23', source, null)).toBe('2026-10-23');
  });
  it('keeps physical delivery intact, charges four days and preserves same-day partial returns', () => {
    const input: AnnexInput = {
      period:{from:'2026-10-23',to:'2026-10-27',through:'2026-10-27'},
      policy:{version:'REV-1',includeReturnDay:true,excludedWeekdays:[],excludeHolidays:false,holidays:[],holidayCalendarConfirmed:true,minimumHoursPerMachineDay:'6'},
      rentals:[{id:'lot',skuId:'sku',label:'Equipo',quantity:'3',deliveredOn:'2026-10-23',billingStartsOn:'2026-10-24',source:{reference:'rem',origin:'INVENTORY'},returns:[],pricing:{basePrice:'100'},waivedDays:[]}],machineDays:[],
    };
    expect(calculateAnnex(input).lines.map(l=>l.date)).toEqual(['2026-10-24','2026-10-25','2026-10-26','2026-10-27']);
    expect(calculateAnnex(input).totals.rentalNet).toBe('1200.00');
    input.rentals[0].returns=[{date:'2026-10-23',quantity:'1',source:{reference:'dev',origin:'INVENTORY'}}];
    const result=calculateAnnex(input);
    expect(result.lines.map(l=>l.quantity)).toEqual(['1','2','2','2','2']);
    expect(result.totals.rentalNet).toBe('900.00');
    expect(input.rentals[0].deliveredOn).toBe('2026-10-23');
  });
});
