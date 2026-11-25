import { businessGreeting } from './whatsapp-greeting';
import {
  employeeGreeting,
  isGreeting,
  REPORT_MENU_ROWS,
  selectionKind,
  whatsappReplyPayload,
} from './whatsapp-menu';

describe('WhatsApp personalized interactive menu', () => {
  const original = process.env.WHATSAPP_ATTENDANCE_ENABLED;
  const originalExtended =
    process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED;
  beforeEach(() => {
    delete process.env.WHATSAPP_ATTENDANCE_ENABLED;
    delete process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED;
  });
  afterAll(() => {
    if (originalExtended === undefined)
      delete process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED;
    else
      process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED = originalExtended;
    if (original === undefined) delete process.env.WHATSAPP_ATTENDANCE_ENABLED;
    else process.env.WHATSAPP_ATTENDANCE_ENABLED = original;
  });
  it('greets by the registered given name without unsafe message markup', () => {
    expect(
      employeeGreeting({ name: 'SAMUEL' }, new Date('2026-11-25T16:59:59Z')),
    ).toBe('Buenos días, Samuel 👋');
    expect(
      employeeGreeting(
        { name: 'ANGIE JULIANA' },
        new Date('2026-11-25T17:00:00Z'),
      ),
    ).toBe('Buenas tardes, Angie Juliana 👋');
    expect(
      employeeGreeting(
        { name: '*HÉCTOR*\n' },
        new Date('2026-11-25T10:00:00Z'),
      ),
    ).toBe('Buenos días, Héctor 👋');
  });
  it('uses one list with only the request option and stable IDs', () => {
    const payload = whatsappReplyPayload(
      '573001234567',
      'Hola, Samuel 👋',
      'REPORT_MENU',
    );
    expect(payload).toEqual(
      expect.objectContaining({
        messaging_product: 'whatsapp',
        type: 'interactive',
        interactive: expect.objectContaining({
          type: 'list',
          body: { text: `${businessGreeting()}, Samuel 👋` },
          action: {
            button: 'Ver opciones',
            sections: [
              { title: '¿Qué deseas reportar?', rows: REPORT_MENU_ROWS },
            ],
          },
        }),
      }),
    );
    expect(REPORT_MENU_ROWS).toHaveLength(1);
    expect(new Set(REPORT_MENU_ROWS.map((r) => r.id)).size).toBe(1);
    expect(
      REPORT_MENU_ROWS.every(
        (r) => r.title.length <= 24 && r.description.length <= 72,
      ),
    ).toBe(true);
  });
  it('offers separate entry/exit buttons and two explicit confirmation buttons', () => {
    process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED = 'true';
    process.env.WHATSAPP_ATTENDANCE_ENABLED = 'true';
    const attendance = whatsappReplyPayload(
      '573001234567',
      'Entrada o salida',
      'ATTENDANCE_MENU',
    ) as any;
    expect(
      attendance.interactive.action.buttons.map((b) => b.reply.id),
    ).toEqual(['attendance_check_in', 'attendance_check_out']);
    const confirmation = whatsappReplyPayload(
      '573001234567',
      '¿Confirmas?',
      'CONFIRMATION',
      'summary-id',
    ) as any;
    expect(
      confirmation.interactive.action.buttons.map((b) => b.reply.id),
    ).toEqual([
      'report_confirm:summary-id',
      'report_photo:summary-id',
      'report_cancel',
    ]);
    expect(
      confirmation.interactive.action.buttons.every(
        (b) => b.reply.title.length <= 20,
      ),
    ).toBe(true);
    expect(selectionKind('attendance_check_in')).toBe('CHECK_IN');
    expect(selectionKind('unknown')).toBeNull();
  });
  it('rejects retired selection IDs and turns queued attendance menus and confirmations into the request-only menu by default', () => {
    expect(selectionKind('attendance_check_in')).toBeNull();
    expect(selectionKind('attendance_check_out')).toBeNull();
    for (const [kind, text] of [
      ['ATTENDANCE_MENU', 'Entrada o salida'],
      ['WORKSITE_MENU', 'Elige obra'],
      ['CONFIRMATION', 'Entrada a obra: Colegio\nResponde SÍ'],
      [
        'CONFIRMATION',
        'Hola, Edgar 👋\nFoto recibida. Fotos adjuntas: 1.\nSalida de obra: Colegio\nResponde SÍ',
      ],
    ]) {
      const p = whatsappReplyPayload(
        '573001234567',
        text,
        kind,
        'old-summary',
      ) as any;
      expect(p.interactive.type).toBe('list');
      expect(p.interactive.body.text).toContain('MiREV');
      expect(
        p.interactive.action.sections[0].rows.map((r: any) => r.id),
      ).toEqual(['report_request']);
    }
    const request = whatsappReplyPayload(
      '573001234567',
      'Petición\nEntrada a obra: necesito permiso',
      'CONFIRMATION',
      'current-summary',
    ) as any;
    expect(request.interactive.type).toBe('button');
  });
  it('retires equipment lists, old summaries and selection IDs without affecting request confirmations or customer replies', () => {
    expect(selectionKind('report_damage')).toBeNull();
    expect(selectionKind('report_hour_meter')).toBeNull();
    expect(selectionKind('report_request')).toBe('REQUEST');
    for (const [kind, text] of [
      ['EQUIPMENT_MENU', 'Selecciona máquina'],
      ['CONFIRMATION', 'Daño: Retro #1\nFalla'],
      [
        'CONFIRMATION',
        'Hola, Samuel 👋\nFoto recibida. Fotos adjuntas: 1.\nHorómetro: Retro #1',
      ],
    ]) {
      const result = whatsappReplyPayload('573001234567', text, kind) as any;
      expect(
        result.interactive.action.sections[0].rows.map((r: any) => r.id),
      ).toEqual(['report_request']);
      expect(result.interactive.body.text).toContain(
        'solo recibimos peticiones',
      );
    }
    const request = whatsappReplyPayload(
      '123',
      'Petición\nDaño: necesito revisión',
      'CONFIRMATION',
      'req',
    ) as any;
    expect(request.interactive.type).toBe('button');
    expect(
      whatsappReplyPayload('123', 'Necesito una rana', 'CUSTOMER_TEXT'),
    ).toMatchObject({ type: 'text', text: { body: 'Necesito una rana' } });
  });
  it('preserves full text for ordinary replies and does not treat a report as a greeting', () => {
    expect(isGreeting('hola')).toBe(true);
    expect(isGreeting('buenos dias')).toBe(true);
    expect(isGreeting('hola el equipo tiene una falla')).toBe(false);
    expect(whatsappReplyPayload('123', 'texto completo')).toEqual({
      messaging_product: 'whatsapp',
      to: '123',
      type: 'text',
      text: { body: 'texto completo' },
    });
  });
});
