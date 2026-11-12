import {
  employeeGreeting,
  isGreeting,
  REPORT_MENU_ROWS,
  selectionKind,
  whatsappReplyPayload,
} from './whatsapp-menu';

describe('WhatsApp personalized interactive menu', () => {
  it('greets by the registered given name without unsafe message markup', () => {
    expect(employeeGreeting({ name: 'SAMUEL' })).toBe('Hola, Samuel 👋');
    expect(employeeGreeting({ name: 'ANGIE JULIANA' })).toBe(
      'Hola, Angie Juliana 👋',
    );
    expect(employeeGreeting({ name: '*HÉCTOR*\n' })).toBe('Hola, Héctor 👋');
  });
  it('uses one list with exactly the four report options and stable IDs', () => {
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
    expect(REPORT_MENU_ROWS).toHaveLength(4);
    expect(new Set(REPORT_MENU_ROWS.map((r) => r.id)).size).toBe(4);
    expect(
      REPORT_MENU_ROWS.every(
        (r) => r.title.length <= 24 && r.description.length <= 72,
      ),
    ).toBe(true);
  });
  it('offers separate entry/exit buttons and two explicit confirmation buttons', () => {
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
