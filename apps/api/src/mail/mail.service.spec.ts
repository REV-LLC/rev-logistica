import { MailService } from './mail.service';

describe('MailService Zoho API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      MAIL_PROVIDER: 'zoho-api',
      MAIL_FROM: 'operaciones@rentaequipos.co',
      ZOHO_ACCOUNT_ID: '12345',
      ZOHO_CLIENT_ID: 'client-id',
      ZOHO_CLIENT_SECRET: 'client-secret',
      ZOHO_REFRESH_TOKEN: 'refresh-token',
      ZOHO_ACCOUNTS_BASE_URL: 'https://accounts.example.test',
      ZOHO_MAIL_BASE_URL: 'https://mail.example.test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('refreshes OAuth, uploads attachments, and sends the message', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: { code: 200, description: 'success' },
            data: {
              storeName: 'store',
              attachmentPath: '/attachment/path',
              attachmentName: 'documento.pdf',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: { code: 200, description: 'success' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await new MailService().sendMail({
      to: 'cliente@example.com',
      subject: 'Devolución DV000001 aprobada',
      text: 'Documento aprobado',
      html: '<p>Documento aprobado</p>',
      attachments: [
        {
          filename: 'documento.pdf',
          content: Buffer.from('pdf'),
          contentType: 'application/pdf',
        },
      ],
    });

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://accounts.example.test/oauth/v2/token',
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/accounts/12345/messages/attachments?',
    );
    const sendBody = JSON.parse(
      String((fetchMock.mock.calls[2][1] as RequestInit).body),
    );
    expect(sendBody).toMatchObject({
      fromAddress: 'operaciones@rentaequipos.co',
      toAddress: 'cliente@example.com',
      attachments: [
        {
          storeName: 'store',
          attachmentPath: '/attachment/path',
          attachmentName: 'documento.pdf',
        },
      ],
    });
  });

  it('does not attempt delivery when OAuth configuration is incomplete', async () => {
    delete process.env.ZOHO_REFRESH_TOKEN;
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      new MailService().sendMail({
        to: 'cliente@example.com',
        subject: 'Prueba',
        text: 'Prueba',
        html: '<p>Prueba</p>',
      }),
    ).resolves.toEqual({ sent: false, reason: 'missing-zoho-config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
