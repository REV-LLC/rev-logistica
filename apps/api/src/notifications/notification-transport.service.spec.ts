import { NotificationTransportService } from './notification-transport.service';

describe('NotificationTransportService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TEMPLATE_NAME;
    delete process.env.WHATSAPP_DOCUMENT_TEMPLATE_NAME;
    delete process.env.WHATSAPP_API_VERSION;
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends WhatsApp through the shared messaging webhook contract', async () => {
    process.env.MESSAGING_WEBHOOK_URL = 'https://messaging.example.test/send';
    process.env.MESSAGING_WEBHOOK_TOKEN = 'secret-token';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
    const service = new NotificationTransportService({} as any);

    await expect(service.sendWhatsapp('+573001234567', {
      title: 'Mantenimiento de EQ-1',
      body: 'Cambio de aceite pendiente.',
      link: 'https://example.test/document/1',
    })).resolves.toEqual({ sent: true });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://messaging.example.test/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-token',
        }),
        body: JSON.stringify({
          channel: 'WHATSAPP',
          to: '+573001234567',
          message: 'Mantenimiento de EQ-1\nCambio de aceite pendiente.',
          link: 'https://example.test/document/1',
        }),
      }),
    );
  });

  it('does not call a provider when WhatsApp is not configured', async () => {
    delete process.env.MESSAGING_WEBHOOK_URL;
    delete process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL;
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new NotificationTransportService({} as any);

    await expect(service.sendWhatsapp('+573001234567', {
      title: 'Alerta',
      body: 'Pendiente',
    })).resolves.toEqual({ sent: false, reason: 'missing-config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an approved utility template through Meta Cloud API', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_TEMPLATE_NAME = 'rev_logistica_notification';
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'es_CO';
    process.env.WHATSAPP_API_VERSION = 'v25.0';
    process.env.PUBLIC_WEB_URL = 'https://app.example.test';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.123' }] }), {
        status: 200,
      }),
    );
    const service = new NotificationTransportService({} as any);

    await expect(service.sendWhatsapp('+573001234567', {
      title: 'Remisión RM000001',
      body: 'REV Logística comparte una copia.',
      link: 'https://app.example.test/documents/shared/token',
      recipientName: 'Cliente Ejemplo',
    })).resolves.toEqual({
      sent: true,
      providerMessageId: 'wamid.123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v25.0/123456789/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer meta-token',
        }),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: '573001234567',
          type: 'template',
          template: {
            name: 'rev_logistica_notification',
            language: { code: 'es_CO' },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: 'Cliente Ejemplo' },
                { type: 'text', text: 'Remisión RM000001. REV Logística comparte una copia.' },
              ],
            }, {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: 'documents/shared/token' }],
            }],
          },
        }),
      }),
    );
  });

  it('sends a PDF in the header of the document utility template', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.WHATSAPP_TEMPLATE_NAME = 'rev_logistica_notification';
    process.env.WHATSAPP_DOCUMENT_TEMPLATE_NAME = 'rev_logistica_document';
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'es_CO';
    process.env.WHATSAPP_API_VERSION = 'v25.0';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.pdf' }] }), {
        status: 200,
      }),
    );
    const service = new NotificationTransportService({} as any);

    await service.sendWhatsapp('+573001234567', {
      title: 'Remisión RM000001',
      body: 'REV Logística comparte una copia.',
      link: 'https://app.example.test/documents/shared/token',
      recipientName: 'Cliente Ejemplo',
      document: {
        link: 'https://api.example.test/public/documents/token/pdf',
        filename: 'remision-RM000001.pdf',
      },
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      template: {
        name: 'rev_logistica_document',
        language: { code: 'es_CO' },
        components: [{
          type: 'header',
          parameters: [{
            type: 'document',
            document: {
              link: 'https://api.example.test/public/documents/token/pdf',
              filename: 'remision-RM000001.pdf',
            },
          }],
        }, {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Cliente Ejemplo' },
            { type: 'text', text: 'la remisión RM000001' },
          ],
        }],
      },
    }));
  });
});
