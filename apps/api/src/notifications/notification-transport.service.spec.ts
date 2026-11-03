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
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const service = new NotificationTransportService({} as any);

    await expect(
      service.sendWhatsapp('+573001234567', {
        title: 'Mantenimiento de EQ-1',
        body: 'Cambio de aceite pendiente.',
        link: 'https://example.test/document/1',
      }),
    ).resolves.toEqual({ sent: true });

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

    await expect(
      service.sendWhatsapp('+573001234567', {
        title: 'Alerta',
        body: 'Pendiente',
      }),
    ).resolves.toEqual({ sent: false, reason: 'missing-config' });
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

    await expect(
      service.sendWhatsapp('+573001234567', {
        title: 'Remisión RM000001',
        body: 'REV Logística comparte una copia.',
        link: 'https://app.example.test/documents/shared/token',
        recipientName: 'Cliente Ejemplo',
      }),
    ).resolves.toEqual({
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
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: 'Cliente Ejemplo' },
                  {
                    type: 'text',
                    text: 'Remisión RM000001. REV Logística comparte una copia.',
                  },
                ],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: 'documents/shared/token' }],
              },
            ],
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
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        template: {
          name: 'rev_logistica_document',
          language: { code: 'es_CO' },
          components: [
            {
              type: 'header',
              parameters: [
                {
                  type: 'document',
                  document: {
                    link: 'https://api.example.test/public/documents/token/pdf',
                    filename: 'remision-RM000001.pdf',
                  },
                },
              ],
            },
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'Cliente Ejemplo' },
                { type: 'text', text: 'la remisión RM000001' },
              ],
            },
          ],
        },
      }),
    );
  });
});

describe('Meta PDF delivery', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ACCESS_TOKEN: 'meta-token',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_DOCUMENT_TEMPLATE_NAME: 'document_template',
      WHATSAPP_API_VERSION: 'v23.0',
      WHATSAPP_TEMPLATE_LANGUAGE: 'es_CO',
    };
    jest.restoreAllMocks();
  });
  afterAll(() => {
    process.env = originalEnv;
  });
  it('uploads the PDF, then sends the existing document template using the returned media id', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'media-1' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [{ id: 'wamid-1' }] })),
      );
    const pdf = Buffer.from('%PDF-example');
    const result = await new NotificationTransportService(
      {} as never,
    ).sendWhatsappPdf(
      '+573001234567',
      {
        title: 'Anexo de alquiler',
        body: 'Para revisión',
        recipientName: 'Cliente',
      },
      pdf,
      'anexo.pdf',
    );
    expect(result).toEqual({ sent: true, providerMessageId: 'wamid-1' });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/123/media');
    const form = request!.body as FormData;
    expect(form.get('messaging_product')).toBe('whatsapp');
    expect(form.get('type')).toBe('application/pdf');
    expect(Buffer.from(await (form.get('file') as Blob).arrayBuffer())).toEqual(
      pdf,
    );
    expect(
      JSON.parse(fetchMock.mock.calls[1][1]!.body as string),
    ).toMatchObject({
      to: '573001234567',
      type: 'template',
      template: {
        name: 'document_template',
        components: [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: { id: 'media-1', filename: 'anexo.pdf' },
              },
            ],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Cliente' },
              { type: 'text', text: 'el anexo de alquiler' },
            ],
          },
        ],
      },
    });
  });
  it('does not fall back to an unrelated webhook when the document template is missing', async () => {
    delete process.env.WHATSAPP_DOCUMENT_TEMPLATE_NAME;
    process.env.MESSAGING_WEBHOOK_URL = 'https://example.test/webhook';
    const fetchMock = jest.spyOn(global, 'fetch');
    expect(
      await new NotificationTransportService({} as never).sendWhatsappPdf(
        '+573001234567',
        { title: 'Anexo', body: 'PDF' },
        Buffer.from('%PDF-'),
        'anexo.pdf',
      ),
    ).toEqual({ sent: false, reason: 'missing-meta-document-config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([new Response('', { status: 500 }), new Response('{}')])(
    'does not send a template when media upload fails',
    async (response) => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
      await expect(
        new NotificationTransportService({} as never).sendWhatsappPdf(
          '+573001234567',
          { title: 'Anexo', body: 'PDF' },
          Buffer.from('%PDF-'),
          'anexo.pdf',
        ),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

it('does not claim delivery when Meta omits its message identifier', async () => {
  const previous = process.env;
  process.env = {
    ...previous,
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_DOCUMENT_TEMPLATE_NAME: 'document_template',
    WHATSAPP_API_VERSION: 'v23.0',
  };
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response('{"id":"media-1"}'))
    .mockResolvedValueOnce(new Response('{}'));
  try {
    await expect(
      new NotificationTransportService({} as never).sendWhatsappPdf(
        '+573001234567',
        { title: 'Anexo', body: 'PDF' },
        Buffer.from('%PDF-'),
        'anexo.pdf',
      ),
    ).rejects.toThrow('Meta no confirmó el identificador');
  } finally {
    process.env = previous;
    fetchMock.mockRestore();
  }
});
