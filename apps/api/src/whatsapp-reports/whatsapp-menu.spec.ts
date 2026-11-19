import {
  employeeGreeting,
  isGreeting,
  REPORT_MENU_ROWS,
  selectionKind,
  whatsappReplyPayload,
} from './whatsapp-menu';

describe('WhatsApp personalized interactive menu', () => {
  const original = process.env.WHATSAPP_ATTENDANCE_ENABLED;
  beforeEach(() => {
    delete process.env.WHATSAPP_ATTENDANCE_ENABLED;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.WHATSAPP_ATTENDANCE_ENABLED;
    else process.env.WHATSAPP_ATTENDANCE_ENABLED = original;
  });
  it('greets by the registered given name without unsafe message markup', () => {
    expect(employeeGreeting({ name: 'SAMUEL' })).toBe('Hola, Samuel 👋');
    expect(employeeGreeting({ name: 'ANGIE JULIANA' })).toBe(
      'Hola, Angie Juliana 👋',
    );
    expect(employeeGreeting({ name: '*HÉCTOR*\n' })).toBe('Hola, Héctor 👋');
  });
  it('uses one list with exactly the three active report options and stable IDs', () => {
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
          body: { text: 'Hola, Samuel 👋' },
          action: {
            button: 'Ver opciones',
            sections: [
              { title: '¿Qué deseas reportar?', rows: REPORT_MENU_ROWS },
            ],
          },
        }),
      }),
    );
    expect(REPORT_MENU_ROWS).toHaveLength(3);
    expect(new Set(REPORT_MENU_ROWS.map((r) => r.id)).size).toBe(3);
    expect(
      REPORT_MENU_ROWS.every(
        (r) => r.title.length <= 24 && r.description.length <= 72,
      ),
    ).toBe(true);
  });
  it('offers separate entry/exit buttons and two explicit confirmation buttons', () => {
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
  it('rejects retired selection IDs and turns queued attendance menus and confirmations into the three-option menu by default', () => {
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
      ).toEqual(['report_damage', 'report_hour_meter', 'report_request']);
    }
    const request = whatsappReplyPayload(
      '573001234567',
      'Petición\nEntrada a obra: necesito permiso',
      'CONFIRMATION',
      'current-summary',
    ) as any;
    expect(request.interactive.type).toBe('button');
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
