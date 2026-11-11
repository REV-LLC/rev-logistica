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
});
