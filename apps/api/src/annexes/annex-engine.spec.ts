import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
function fixture(): AnnexInput {
  return {
    period: { from: '2026-09-01', to: '2026-09-15', through: '2026-09-15' },
    policy: { version: 'REV-1', includeReturnDay: true, excludedWeekdays: [], excludeHolidays: false,
      holidays: [], holidayCalendarConfirmed: true, minimumHoursPerMachineDay: '6' },
    rentals: [], machineDays: [],
  };
}
function rental(): AnnexInput['rentals'][number] {
  return { id: 'lot-1', skuId: 'sku-1', label: 'Plataforma', deliveredOn: '2026-09-02', quantity: '3',
    source: { reference: 'remission-item-1', origin: 'INVENTORY' }, returns: [], pricing: { basePrice: '1265' }, waivedDays: [] };
}
function machineDay(date = '2026-09-01', hours = '2'): AnnexInput['machineDays'][number] {
  return { assetId: 'case-1', label: 'Minicargador', date, status: 'REPORTED', pricing: { basePrice: '80000' },
    reports: [{ source: { reference: `report-${date}`, origin: 'PHYSICAL' }, employeeId: 'operator-1', hours }] };
}
describe('annex calculation', () => {
  it('reconciles the nine daily rows from FE3862 exactly', () => {
    const input = fixture();
    const rows = [[3,1265,53130],[4,231,12936],[4,165,9240],[4,297,16632],[4,440,24640],[12,187,31416],[12,363,60984],[8,385,43120],[2,1485,41580]];
    input.rentals = rows.map(([quantity, basePrice], i) => ({ ...rental(), id: `lot-${i}`, source: { reference: `item-${i}`, origin: 'INVENTORY' }, quantity: String(quantity), pricing: { basePrice: String(basePrice) } }));
    const result = calculateAnnex(input);
    expect(result.totals.rentalNet).toBe('293678.00');
    rows.forEach((row, i) => expect(result.lines.filter(l => l.key.startsWith(`lot-${i}:`)).reduce((s, l) => s + Number(l.net), 0)).toBe(row[2]));
  });
  it('keeps 39 original hours but bills the newly specified 78-hour minimum', () => {
    const input = fixture(); const dates = [1,2,3,4,5,7,8,9,10,11,12,14,15]; const hours = [2,3,3,2,2,3,3,3,3,3,3,4,5];
    input.machineDays = dates.map((day, i) => machineDay(`2026-09-${String(day).padStart(2,'0')}`, String(hours[i])));
    const result = calculateAnnex(input);
    expect(result.lines.reduce((s, l) => s + Number(l.reportedHours), 0)).toBe(39);
    expect(result.lines.reduce((s, l) => s + Number(l.billableUnits), 0)).toBe(78);
    expect(result.totals.rentalNet).toBe('6240000.00');
    expect(result.issues.filter(i => i.code === 'LABOR_PENDING')).toHaveLength(13);
  });
  it('applies a minimum once per machine/day, not per report or operator', () => {
    const input = fixture(); const day = machineDay();
    day.reports.push({ source: { reference: 'second', origin: 'DIGITAL' }, employeeId: 'operator-2', hours: '5' });
    input.machineDays = [day];
    expect(calculateAnnex(input).lines[0].billableUnits).toBe('7');
  });
  it('bills same-day return once even with exclusive return-day policy', () => {
    const input = fixture(); input.policy.includeReturnDay = false;
    const lot = rental(); lot.returns = [{ date: lot.deliveredOn, quantity: '3', source: { reference: 'return-1', origin: 'INVENTORY' } }]; input.rentals = [lot];
    const result = calculateAnnex(input);
    expect(result.lines).toHaveLength(1); expect(result.totals.rentalNet).toBe('3795.00');
  });
  it('reduces quantity after a partial return, including the return day when configured', () => {
    const input = fixture(); input.period.through = '2026-09-04';
    const lot = rental(); lot.returns = [{ date: '2026-09-03', quantity: '2', source: { reference: 'return-1', origin: 'INVENTORY' } }]; input.rentals = [lot];
    expect(calculateAnnex(input).lines.map(l => l.quantity)).toEqual(['3','3','1']);
    input.policy.includeReturnDay = false;
    expect(calculateAnnex(input).lines.map(l => l.quantity)).toEqual(['3','1','1']);
  });
  it('honors data cutoff separately from the contractual end', () => {
    const input = fixture(); input.period = { from: '2026-09-16', through: '2026-09-25', to: '2026-09-30' }; input.rentals = [rental()];
    expect(calculateAnnex(input).lines).toHaveLength(10);
    input.period.through = '2026-09-26'; expect(calculateAnnex(input).lines).toHaveLength(11);
  });
  it('excludes agreed weekends/holidays only from daily rental', () => {
    const input = fixture(); input.policy.excludedWeekdays = [0,6]; input.policy.excludeHolidays = true; input.policy.holidays = ['2026-09-07']; input.rentals = [rental()]; input.machineDays = [machineDay('2026-09-06')];
    const result = calculateAnnex(input);
    expect(result.lines.filter(l => l.kind === 'DAY')).toHaveLength(9);
    expect(result.lines.find(l => l.kind === 'HOUR')?.net).toBe('480000.00');
  });
  it('keeps price edits exact while deriving their percentage', () => {
    const input = fixture(); const day = machineDay(); day.pricing = { basePrice: '3', effectivePrice: '1', adjustmentReason: 'Acuerdo' }; input.machineDays = [day];
    const line = calculateAnnex(input).lines[0];
    expect(line.net).toBe('6.00'); expect(line.discount).toBe('12.00'); expect(line.discountPercent).toBe('66.666666666667');
  });
  it('preserves an explicit failure waiver and its reason', () => {
    const input = fixture(); const day = machineDay(); day.waiverReason = 'Equipo no funcionó'; input.machineDays = [day];
    const line = calculateAnnex(input).lines[0]; expect(line.net).toBe('0.00'); expect(line.gross).toBe('480000.00'); expect(line.waived).toBe(true);
  });
  it('does not bill pending/no-work days or silently treat them alike', () => {
    const input = fixture(); input.machineDays = [{ ...machineDay(), reports: [], status: 'PENDING' }, { ...machineDay('2026-09-02'), reports: [], status: 'NO_WORK', confirmationReason: 'Sin actividad confirmado' }];
    const result = calculateAnnex(input); expect(result.lines).toHaveLength(0); expect(result.issues.map(i => i.code)).toEqual(['REPORT_PENDING']);
  });
  it.each(['2026-02-29','2026-09-31'])('rejects invalid civil date %s', date => {
    const input = fixture(); input.rentals = [{ ...rental(), deliveredOn: date }]; expect(() => calculateAnnex(input)).toThrow('Fecha inválida');
  });
  it('accepts leap day and does not rely on elapsed local DST hours', () => {
    const input = fixture(); input.period = { from: '2028-02-28', to: '2028-02-29', through: '2028-02-29' }; input.rentals = [rental()];
    expect(calculateAnnex(input).lines).toHaveLength(2);
  });
  it('rejects over-return and return before delivery', () => {
    const input = fixture(); const lot = rental(); input.rentals = [lot];
    lot.returns = [{ date: '2026-09-04', quantity: '4', source: { reference: 'return-1', origin: 'INVENTORY' } }]; expect(() => calculateAnnex(input)).toThrow('superan');
    lot.returns[0] = { ...lot.returns[0], date: '2026-09-01', quantity: '1' }; expect(() => calculateAnnex(input)).toThrow('anterior');
  });
  it('rejects duplicate physical/digital copies of a report', () => {
    const input = fixture(); const a = machineDay(); const b = machineDay('2026-09-02'); b.reports[0].source = { ...a.reports[0].source, origin: 'DIGITAL' }; input.machineDays = [a,b]; expect(() => calculateAnnex(input)).toThrow('duplicado');
  });
  it('accepts discounts and effective prices without adjustment reasons', () => {
    for (const pricing of [{ basePrice: '100', discountPercent: '10' }, { basePrice: '100', effectivePrice: '90' }]) {
      const input = fixture();
      input.rentals = [{ ...rental(), pricing }];
      input.machineDays = [{ ...machineDay(), pricing }];
      const result = calculateAnnex(input);
      expect(result.totals.rentalNet).toBe('4320.00');
      expect(result.lines.every(line => line.reason === null)).toBe(true);
    }
  });
  it('uses per-machine daily minimums without changing other assets or unworked days', () => {
    const input = fixture();
    input.policy.minimumHoursByAsset = { 'case-1': '8', 'no-minimum': '0' };
    const other = {...machineDay('2026-09-02','3'),assetId:'other'};
    const noMinimum = {...machineDay('2026-09-03','3'),assetId:'no-minimum'};
    const noWork = {...machineDay('2026-09-04'),status:'NO_WORK' as const,reports:[],confirmationReason:'Sin trabajo'};
    const pending = {...machineDay('2026-09-05'),status:'PENDING' as const,reports:[]};
    input.machineDays = [machineDay('2026-09-01','3'),other,noMinimum,noWork,pending,machineDay('2026-09-06','10')];
    const result = calculateAnnex(input);
    expect(result.lines.map(line=>line.billableUnits)).toEqual(['8','6','3','10']);
    input.policy.minimumHoursByAsset['case-1']='25';
    expect(()=>calculateAnnex(input)).toThrow('24');
  });
  it('rejects excessive discounts, negative values and missing prices', () => {
    for (const pricing of [{ basePrice: '10', discountPercent: '101', adjustmentReason: 'Acuerdo' }, { basePrice: '-1' }, {}]) {
      const input = fixture(); input.machineDays = [{ ...machineDay(), pricing: pricing as never }]; expect(() => calculateAnnex(input)).toThrow();
    }
  });
  it('rejects overlapping serialized rentals and mixed hourly/daily billing', () => {
    const input = fixture(); input.rentals = [{ ...rental(), quantity: '1', assetId: 'case-1' }]; input.machineDays = [machineDay('2026-09-03')]; expect(() => calculateAnnex(input)).toThrow('simultáneamente');
    input.machineDays = []; input.rentals.push({ ...input.rentals[0], id: 'another', source: { reference: 'another-source', origin: 'INVENTORY' } }); expect(() => calculateAnnex(input)).toThrow('solapados');
  });
  it('marks an unverified calendar and source completeness explicitly', () => {
    const input = fixture(); input.policy.holidayCalendarConfirmed = false;
    const result = calculateAnnex(input); expect(result.issues[0].code).toBe('CALENDAR_PENDING'); expect(result.sourceCompleteness).toBe('UNVERIFIED'); expect(result.status).toBe('DRAFT');
  });
});

describe('manual commercial rental days', () => {
  function adjusted(days: number) {
    const input = fixture();
    input.period.through = '2026-09-04';
    input.rentals = [{ ...rental(), dayAdjustments: [{ from: '2026-09-02', to: '2026-09-04', days, quantity: '3' }] }];
    return input;
  }
  it.each([[2, '7590.00'], [4, '15180.00'], [0, '0.00']])('charges %s days without changing dates or inventory sources', (days, total) => {
    const input = adjusted(days as number), before = JSON.stringify(input);
    const result = calculateAnnex(input);
    expect(result.totals.rentalNet).toBe(total);
    expect(result.lines.map(l => l.date)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
    expect(result.lines.every(l => l.quantity === '3' && l.sources[0].reference === 'remission-item-1')).toBe(true);
    expect(result.lines.reduce((n, l) => n + Number(l.billableUnits), 0)).toBe(days);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('preserves daily cent rounding and discounts when adding a day', () => {
    const input = adjusted(4);
    input.rentals[0].pricing = { basePrice: '0.01', discountPercent: '50' };
    const result = calculateAnnex(input);
    expect(result.totals).toEqual({ rentalGross: '0.12', rentalDiscount: '0.04', rentalNet: '0.08' });
  });
  it('keeps the new dates automatic as the annex grows', () => {
    const input = adjusted(2); input.period.through = '2026-09-05';
    expect(calculateAnnex(input).totals.rentalNet).toBe('11385.00');
  });
  it('adjusts only the selected balance segment after a partial return', () => {
    const input = adjusted(2);
    input.rentals[0].returns = [{ date: '2026-09-03', quantity: '2', source: { reference: 'return-1', origin: 'INVENTORY' } }];
    input.rentals[0].dayAdjustments = [{ from: '2026-09-04', to: '2026-09-04', quantity: '1', days: 2 }];
    expect(calculateAnnex(input).totals.rentalNet).toBe('10120.00');
  });
  it('rejects negative/fractional values, overlaps, excluded days, changed balances and dates outside recorded data', () => {
    for (const days of [-1, 1.5, 1000]) expect(() => calculateAnnex(adjusted(days))).toThrow();
    let input = adjusted(2);
    input.rentals[0].dayAdjustments!.push({ ...input.rentals[0].dayAdjustments![0] });
    expect(() => calculateAnnex(input)).toThrow(/solaparse/);
    input = adjusted(2); input.policy.excludedWeekdays = [4];
    expect(() => calculateAnnex(input)).toThrow(/exclusiones/);
    input = adjusted(2); input.rentals[0].quantity = '4';
    expect(() => calculateAnnex(input)).toThrow(/cantidad/);
    input = adjusted(2); input.rentals[0].dayAdjustments![0].to = '2026-09-05';
    expect(() => calculateAnnex(input)).toThrow(/corte/);
  });
});

describe('zero rental rates', () => {
  it.each([{basePrice:'0'}, {basePrice:'0',discountPercent:'15'}, {basePrice:'0',effectivePrice:'0'}])('keeps daily quantities and reported hours with zero totals and finite discounts', pricing => {
    const input=fixture(); input.period.through='2026-09-02';
    input.rentals=[{...rental(),pricing}];input.machineDays=[{...machineDay(),pricing}];
    const result=calculateAnnex(input);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.find(l=>l.kind==='DAY')?.quantity).toBe('3');
    expect(result.lines.find(l=>l.kind==='HOUR')?.billableUnits).toBe('6');
    expect(result.totals).toEqual({rentalGross:'0.00',rentalDiscount:'0.00',rentalNet:'0.00'});
    expect(result.lines.every(l=>Number.isFinite(Number(l.discountPercent)) && l.net==='0.00')).toBe(true);
  });
});

describe('minimums across rental cuts', () => {
  const returned = (date: string, quantity: string, ref = date) => ({date,quantity,source:{reference:ref,origin:'INVENTORY' as const}});
  it('charges ten TOTAL for delivery on 15 and return on 16', () => {
    const first=fixture(); first.policy.minimumDaysBySku={'sku-1':10};
    first.rentals=[{...rental(),quantity:'1',deliveredOn:'2026-09-15',pricing:{basePrice:'100'},returns:[returned('2026-09-16','1')]}];
    expect(calculateAnnex(first).totals.rentalNet).toBe('100.00');
    const second=structuredClone(first); second.period={from:'2026-09-16',to:'2026-09-30',through:'2026-09-30'};
    second.rentals[0].priorBillableDays='1';
    expect(calculateAnnex(second).totals.rentalNet).toBe('900.00');
  });
  it('settles only returned quantities, without billing the supplement again for the remainder', () => {
    const input=fixture(); input.policy.minimumDaysBySku={'sku-1':10};
    input.rentals=[{...rental(),quantity:'3',deliveredOn:'2026-09-01',pricing:{basePrice:'100'},returns:[returned('2026-09-02','1'),returned('2026-09-12','2')]}];
    expect(calculateAnnex(input).totals.rentalNet).toBe('3400.00');
    const supplements=calculateAnnex(input).lines.filter(l=>l.key.includes(':minimum:'));
    expect(supplements).toHaveLength(1); expect(supplements[0].quantity).toBe('1'); expect(supplements[0].billableUnits).toBe('8');
  });
  it('same-day return, zero tariff, minimum disabled and missing historical reconciliation', () => {
    const input=fixture(); input.policy.minimumDaysBySku={'sku-1':10};
    input.rentals=[{...rental(),quantity:'1',returns:[returned('2026-09-02','1')],pricing:{basePrice:'0'}}];
    expect(calculateAnnex(input).lines.reduce((n,l)=>n+Number(l.billableUnits),0)).toBe(10);
    expect(calculateAnnex(input).totals.rentalNet).toBe('0.00');
    input.policy.minimumDaysBySku['sku-1']=0;
    expect(calculateAnnex(input).lines).toHaveLength(1);
    input.policy.minimumDaysBySku['sku-1']=10; input.rentals[0].deliveredOn='2026-08-31';
    expect(calculateAnnex(input).issues.some(i=>i.code==='MINIMUM_HISTORY_PENDING')).toBe(true);
  });
  it('uses adjusted days as credited days and respects excluded return dates', () => {
    const input=fixture();input.policy.minimumDaysBySku={'sku-1':3};input.policy.excludedWeekdays=[0];
    input.rentals=[{...rental(),deliveredOn:'2026-09-05',quantity:'1',pricing:{basePrice:'100'},returns:[returned('2026-09-06','1')]}];
    expect(calculateAnnex(input).totals.rentalNet).toBe('300.00');
    input.rentals[0].dayAdjustments=[{from:'2026-09-05',to:'2026-09-05',days:4,quantity:'1'}];
    expect(calculateAnnex(input).totals.rentalNet).toBe('400.00');
  });
  it('cutter with disk replaces daily charges and minimum 40 is applied once across cuts', () => {
    const input=fixture(); input.policy.minimumDaysBySku={'sku-1':3};
    input.rentals=[{...rental(),quantity:'1',deliveredOn:'2026-09-15',allowsCutting:true,returns:[returned('2026-09-16','1')],cutting:{minimumMeters:'40',pricing:{basePrice:'1000',discountPercent:'10'},reports:[{date:'2026-09-15',meters:'12',source:{reference:'CUT-1',origin:'PHYSICAL'}}]}}];
    expect(calculateAnnex(input).totals.rentalNet).toBe('10800.00');
    expect(calculateAnnex(input).lines.every(l=>l.kind==='METER')).toBe(true);
    input.period={from:'2026-09-16',to:'2026-09-30',through:'2026-09-30'};
    input.rentals[0].cutting!.reports.push({date:'2026-09-16',meters:'8',source:{reference:'CUT-2',origin:'PHYSICAL'}});
    expect(calculateAnnex(input).totals.rentalNet).toBe('25200.00');
    input.rentals[0].cutting!.reports[1].meters='38';
    expect(calculateAnnex(input).totals.rentalNet).toBe('34200.00');
  });
  it('rejects duplicate or out-of-rental cutting reports and unsupported equipment',()=>{
    const input=fixture(); input.rentals=[{...rental(),quantity:'1',allowsCutting:true,cutting:{minimumMeters:'40',pricing:{basePrice:'0'},reports:[{date:'2026-09-01',meters:'1',source:{reference:'CUT-1',origin:'PHYSICAL'}}]}}];
    expect(()=>calculateAnnex(input)).toThrow('fuera del alquiler');
    input.rentals[0].cutting!.reports[0].date='2026-09-02';
    input.rentals[0].cutting!.reports.push({...input.rentals[0].cutting!.reports[0]});
    expect(()=>calculateAnnex(input)).toThrow('duplicada');
    input.rentals[0].allowsCutting=false;
    input.rentals[0].cutting!.reports.pop();
    expect(calculateAnnex(input).lines[0].kind).toBe('METER');
  });
});
