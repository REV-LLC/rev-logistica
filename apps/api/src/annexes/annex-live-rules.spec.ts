import { applySavedAnnexRules } from './annex-live-rules';
import { calculateAnnex } from './annex-engine';
import type { AnnexInput } from './annex-input';
const fixture = (): AnnexInput => ({
  period: { from: '2026-10-01', to: '2026-10-15', through: '2026-10-15' },
  policy: {
    version: 'test',
    vatPercent: 19,
    includeReturnDay: true,
    excludedWeekdays: [],
    excludeHolidays: false,
    holidays: [],
    holidayCalendarConfirmed: true,
    minimumHoursPerMachineDay: '6',
  },
  rentals: [
    {
      id: 'lot',
      skuId: 'sku',
      label: 'Equipo',
      quantity: '4',
      deliveredOn: '2026-10-01',
      billingAreaM2: '1.44',
      source: { reference: 'rem', origin: 'INVENTORY' },
      pricing: { basePrice: '3000' },
      returns: [
        {
          date: '2026-10-09',
          billingCutoffDate: '2026-10-08',
          quantity: '4',
          source: { reference: 'dev', origin: 'INVENTORY' },
        },
      ],
      waivedDays: [],
    },
  ],
  machineDays: [],
});
describe('live annex saved rules', () => {
  it('uses current quantities, cuts and tariffs while keeping manual financial entries', () => {
    const fresh = fixture(),
      saved = fixture();
    saved.rentals[0].quantity = '20';
    saved.rentals[0].returns = [];
    saved.rentals[0].pricing = { basePrice: '1000' };
    saved.transport = {
      outbound: { quantity: '1', unitPrice: '50000' },
      return: { quantity: '0', unitPrice: '0' },
    };
    saved.observations = 'Observación guardada';
    saved.policy.vatPercent = 0;
    saved.additionalCharges = [
      {
        id: 'repair',
        type: 'REPAIR',
        description: 'Reparación',
        quantity: '2',
        unitPrice: '12500',
      },
    ];
    const original = JSON.stringify({ fresh, saved });
    const { input } = applySavedAnnexRules(fresh, saved);
    expect(input.rentals[0].quantity).toBe('4');
    expect(input.rentals[0].returns[0].billingCutoffDate).toBe('2026-10-08');
    expect(input.rentals[0].pricing.basePrice).toBe('3000');
    expect(calculateAnnex(input).summary.subtotal).toBe('213240.00');
    expect(input.observations).toBe(saved.observations);
    expect(calculateAnnex(input).tax.vat).toBe('0.00');
    expect(JSON.stringify({ fresh, saved })).toBe(original);
  });
  it('reapplies a manual discount to the current catalog base, including explicit zero', () => {
    const fresh = fixture(),
      saved = fixture();
    saved.rentals[0].pricing = {
      basePrice: '1000',
      discountPercent: '10',
      adjustmentSource: 'MANUAL',
    };
    let input = applySavedAnnexRules(fresh, saved).input;
    expect(calculateAnnex(input).totals.rentalNet).toBe('124416.00');
    saved.rentals[0].pricing.discountPercent = '0';
    input = applySavedAnnexRules(fresh, saved).input;
    expect(calculateAnnex(input).totals.rentalNet).toBe('138240.00');
  });
  it('preserves a fixed manual final price without freezing a generated customer agreement', () => {
    const fresh = fixture(),
      saved = fixture();
    saved.rentals[0].pricing = {
      basePrice: '3000',
      effectivePrice: '2750',
      adjustmentSource: 'MANUAL',
    };
    expect(
      calculateAnnex(applySavedAnnexRules(fresh, saved).input).totals.rentalNet,
    ).toBe('126720.00');
    fresh.rentals[0].pricing = {
      basePrice: '3000',
      effectivePrice: '2500',
      adjustmentSource: 'CUSTOMER',
    };
    saved.rentals[0].pricing.adjustmentSource = 'CUSTOMER';
    expect(
      calculateAnnex(applySavedAnnexRules(fresh, saved).input).totals.rentalNet,
    ).toBe('115200.00');
    delete saved.rentals[0].pricing.adjustmentSource;
    saved.rentals[0].pricing.adjustmentReason =
      'Tarifa acordada para el cliente';
    expect(
      calculateAnnex(applySavedAnnexRules(fresh, saved).input).totals.rentalNet,
    ).toBe('115200.00');
  });
  it('does not resurrect removed lots and includes new database deliveries', () => {
    const fresh = fixture(),
      saved = fixture();
    fresh.rentals[0].id = 'new-lot';
    saved.rentals[0].pricing.discountPercent = '100';
    const { input } = applySavedAnnexRules(fresh, saved);
    expect(input.rentals.map((r) => r.id)).toEqual(['new-lot']);
    expect(calculateAnnex(input).totals.rentalNet).toBe('138240.00');
  });
  it('retains an annex-only raised base through reloads and later discounts', () => {
    const fresh = fixture(), saved = fixture();
    saved.rentals[0].pricing = {
      basePrice: '3500.25', basePriceOverride: '3500.25',
      effectivePrice: '3500.25', adjustmentSource: 'MANUAL',
    };
    const original = JSON.stringify(fresh);
    const first = applySavedAnnexRules(fresh, saved).input;
    expect(first.rentals[0].pricing.basePrice).toBe('3500.25');
    expect(calculateAnnex(first).lines[0].discountPercent).toBe('0.000000000000');
    delete first.rentals[0].pricing.effectivePrice;
    first.rentals[0].pricing.discountPercent = '10';
    const reloaded = applySavedAnnexRules(fresh, first).input;
    expect(reloaded.rentals[0].pricing.basePriceOverride).toBe('3500.25');
    expect(calculateAnnex(reloaded).lines[0].effectivePrice).toBe('3150.225000000000');
    expect(JSON.stringify(fresh)).toBe(original);
    // A later catalog increase still sets the floor for the base.
    fresh.rentals[0].pricing.basePrice = '4000';
    expect(applySavedAnnexRules(fresh, first).input.rentals[0].pricing.basePrice).toBe('4000.00');
  });
  it('applies saved minima, calendar exclusions and valid manual day adjustments', () => {
    const fresh = fixture(),
      saved = fixture();
    saved.policy.minimumDaysBySku = { sku: 10 };
    fresh.rentals[0].priorBillableDays = '2';
    saved.rentals[0].dayAdjustments = [
      { from: '2026-10-01', to: '2026-10-08', quantity: '4', days: 9 },
    ];
    const { input, issues } = applySavedAnnexRules(fresh, saved);
    expect(issues).toEqual([]);
    expect(calculateAnnex(input).totals.rentalNet).toBe('155520.00');
    saved.policy.excludedWeekdays = [0];
    saved.rentals[0].dayAdjustments = [];
    expect(
      applySavedAnnexRules(fresh, saved).input.policy.excludedWeekdays,
    ).toEqual([0]);
  });
  it('shows current inventory and flags an obsolete day adjustment instead of silently using stale quantities', () => {
    const fresh = fixture(),
      saved = fixture();
    saved.rentals[0].dayAdjustments = [
      { from: '2026-10-01', to: '2026-10-09', quantity: '4', days: 10 },
    ];
    const { input, issues } = applySavedAnnexRules(fresh, saved);
    expect(input.rentals[0].dayAdjustments).toEqual([]);
    expect(issues[0].code).toBe('SAVED_DAY_ADJUSTMENT_REVIEW');
    expect(calculateAnnex(input).totals.rentalNet).toBe('138240.00');
    expect(saved.rentals[0].dayAdjustments).toHaveLength(1);
  });
});

it('preserves detailed transport and linked replacements when reapplying saved rules', () => {
  const fresh = fixture(), saved = fixture();
  saved.transport = {outbound:{quantity:'0',unitPrice:'0'},return:{quantity:'0',unitPrice:'0'},rows:[
    {id:'trip-1',direction:'outbound',description:'Entrega inicial',quantity:'1',unitPrice:'60'},
    {id:'trip-2',direction:'return',description:'Recogida parcial',quantity:'1',unitPrice:'40'},
  ]};
  saved.additionalCharges = [{id:'replacement',skuId:'eb66aaf3-b010-4f9d-9825-857a2c3d4d43',type:'REPLACEMENT',description:'Pieza perdida',quantity:'2',unitPrice:'20'}];
  const {input} = applySavedAnnexRules(fresh, saved);
  expect(input.transport).toEqual(saved.transport);
  expect(input.additionalCharges).toEqual(saved.additionalCharges);
  expect(input.transport?.rows).not.toBe(saved.transport.rows);
  expect(input.additionalCharges).not.toBe(saved.additionalCharges);
  const result = calculateAnnex(input);
  expect(result.transport).toEqual({outbound:'60.00',return:'40.00',total:'100.00'});
  expect(result.additionalChargesTotal).toBe('40.00');
  expect(result.summary.subtotal).toBe('138380.00');
  // Deleting every manual row must not restore legacy totals on the next refresh.
  fresh.transport = {outbound:{quantity:'1',unitPrice:'999'},return:{quantity:'1',unitPrice:'999'}};
  saved.transport.rows = [];
  saved.additionalCharges = [];
  const cleared = calculateAnnex(applySavedAnnexRules(fresh, saved).input);
  expect(cleared.transport.total).toBe('0.00');
  expect(cleared.additionalChargesTotal).toBe('0.00');
});
