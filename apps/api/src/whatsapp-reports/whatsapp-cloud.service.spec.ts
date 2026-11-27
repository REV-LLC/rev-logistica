import sharp from 'sharp';
import { WhatsappCloudService } from './whatsapp-cloud.service';

describe('WhatsApp Cloud media boundaries', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const service = new WhatsappCloudService();
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WHATSAPP_ACCESS_TOKEN: 'test-token',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_API_VERSION: 'v25.0',
    };
    delete process.env.WHATSAPP_ATTENDANCE_ENABLED;
    delete process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED;
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('does not send bearer credentials to a media URL outside Meta', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://attacker.example/photo',
          mime_type: 'image/jpeg',
          file_size: 10,
        }),
      ),
    );
    await expect(service.photo('456')).rejects.toThrow(
      'Invalid Meta media host',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized and non-photo media before download', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://lookaside.fbsbx.com/photo',
          mime_type: 'application/pdf',
          file_size: 10,
        }),
      ),
    );
    await expect(service.photo('456')).rejects.toThrow('Photo must be');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://lookaside.fbsbx.com/photo',
          mime_type: 'image/jpeg',
          file_size: 6 * 1024 * 1024,
        }),
      ),
    );
    await expect(service.photo('456')).rejects.toThrow('Photo must be');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('validates and converts a decoded photo, using bounded requests without redirects', async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://lookaside.fbsbx.com/photo',
          mime_type: 'image/png',
          file_size: image.length,
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(image));
    const result = await service.photo('456');
    expect((await sharp(result.buffer).metadata()).format).toBe('jpeg');
    expect(fetchMock.mock.calls[0][0]).toContain('phone_number_id=123');
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it('rejects content that is not actually a decodable photo', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://lookaside.fbsbx.com/photo',
          mime_type: 'image/jpeg',
          file_size: 10,
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response('not an image'));
    await expect(service.photo('456')).rejects.toThrow();
  });
  it.each([
    'https://attacker.example/audio',
    'http://lookaside.fbsbx.com/audio',
    'https://lookaside.fbsbx.com.attacker.example/audio',
    'https://secret@lookaside.fbsbx.com/audio',
  ])('never sends credentials to invalid audio host %s', async (url) => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ url, mime_type: 'audio/ogg', file_size: 20 }),
      ),
    );
    await expect(service.audio('456')).rejects.toThrow(
      'Invalid Meta audio host',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { mime_type: 'application/pdf', file_size: 20 },
    { mime_type: 'audio/ogg', file_size: 17 * 1024 * 1024 },
  ])(
    'rejects unsupported or oversized audio before downloading',
    async (metadata) => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: 'https://lookaside.fbsbx.com/audio',
            ...metadata,
          }),
        ),
      );
      await expect(service.audio('456')).rejects.toThrow('Audio must be');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('serves original Opus bytes with bounded authenticated requests', async () => {
    const bytes = Buffer.from('OggS test OpusHead original');
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: 'https://lookaside.fbsbx.com/audio',
          mime_type: 'audio/ogg; codecs=opus',
          file_size: bytes.length,
        }),
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response(bytes));
    const result = await service.audio('456');
    expect(result.buffer).toEqual(bytes);
    expect(result.mimetype).toBe('audio/ogg; codecs=opus');
    expect(result.filename).toBe('nota-de-voz.ogg');
    expect(fetchMock.mock.calls[0][0]).toContain('phone_number_id=123');
    for (const [, options] of fetchMock.mock.calls)
      expect(options).toEqual(
        expect.objectContaining({
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }),
      );
  });
  it('rejects disguised non-audio and oversize streamed content', async () => {
    const meta = () =>
      new Response(
        JSON.stringify({
          url: 'https://lookaside.fbsbx.com/audio',
          mime_type: 'audio/ogg',
        }),
      );
    fetchMock
      .mockResolvedValueOnce(meta())
      .mockResolvedValueOnce(new Response('<html>not audio</html>'));
    await expect(service.audio('456')).rejects.toThrow('Invalid audio content');
    fetchMock
      .mockResolvedValueOnce(meta())
      .mockResolvedValueOnce(new Response(Buffer.alloc(16 * 1024 * 1024 + 1)));
    await expect(service.audio('456')).rejects.toThrow('Audio too large');
  });
  it('sends the native list payload through the existing authenticated Meta endpoint', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    await service.reply('573001234567', 'Hola, Samuel 👋', 'REPORT_MENU');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v25.0/123/messages');
    const payload = JSON.parse(options.body);
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.action.sections[0].rows).toHaveLength(1);
    expect(options.redirect).toBe('error');
  });
  it('sends persisted equipment rows and remembered-machine buttons only for legacy opt-in environments', async () => {
    process.env.WHATSAPP_EMPLOYEE_EXTENDED_REPORTS_ENABLED = 'true';
    fetchMock.mockResolvedValue(new Response('{}'));
    const rows = [
      {
        id: 'equipment:nonce:0',
        title: 'Retroexcavadora #2',
        description: 'Caterpillar · QA-02',
      },
    ];
    await service.reply(
      '573001234567',
      'Elige la máquina',
      'EQUIPMENT_MENU',
      undefined,
      { type: 'list', button: 'Ver máquinas', rows },
    );
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).interactive.action,
    ).toEqual({
      button: 'Ver máquinas',
      sections: [{ title: 'Máquinas disponibles', rows }],
    });
    const buttons = [
      { id: 'equipment:nonce:0', title: 'Usar esta máquina' },
      { id: 'equipment_other:nonce', title: 'Elegir otra' },
    ];
    await service.reply(
      '573001234567',
      '¿La misma máquina?',
      'EQUIPMENT_MENU',
      undefined,
      { type: 'button', buttons },
    );
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).interactive.action.buttons,
    ).toEqual(buttons.map((reply) => ({ type: 'reply', reply })));
  });
});
