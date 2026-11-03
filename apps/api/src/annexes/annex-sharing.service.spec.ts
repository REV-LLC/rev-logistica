import { AnnexSharingService } from './annex-sharing.service';
const id = '00000000-0000-4000-8000-000000000001';
const site = {
  id,
  alias: 'Obra Norte',
  customer: {
    name: 'Cliente <Uno>',
    phone: '3001234567',
    email: 'GERENCIA@example.test',
    documentsPhone: '+57 3001234567',
    documentsEmail: 'docs@example.test',
    billingPhone: '3011234567',
    billingAlternatePhone: '3021234567',
    contactDirectory: [
      { label: 'Cartera', phone: '3031234567', email: 'cartera@example.test' },
      null,
      'invalid',
      { label: 'Sin datos', email: 'bad', phone: 'bad' },
    ],
  },
  worksite: {
    name: 'Obra',
    contactName: 'Residente',
    phone: '3041234567',
    alternatePhone: '3051234567',
    email: 'obra@example.test',
  },
};
const body = {
  channel: 'WHATSAPP',
  recipient: '3001234567',
  from: '2026-11-01',
  to: '2026-11-15',
  through: '2026-11-03',
  requestId: '00000000-0000-4000-8000-000000000002',
};
const file = {
  buffer: Buffer.from('%PDF-1.4\nexample'),
  mimetype: 'application/pdf',
};
function setup() {
  const prisma = {
    customerWorksite: { findUnique: jest.fn(async () => site) },
  };
  const mail = { sendMail: jest.fn(async () => ({ sent: true })) };
  const transport = {
    sendWhatsappPdf: jest.fn(async () => ({
      sent: true,
      providerMessageId: 'wamid-1',
    })),
  };
  const idempotency = { execute: jest.fn(async ({ run }) => run()) };
  return {
    service: new AnnexSharingService(
      prisma as never,
      mail as never,
      transport as never,
      idempotency as never,
    ),
    prisma,
    mail,
    transport,
    idempotency,
  };
}
it('loads worksite and client contact directories, normalizes and deduplicates destinations', async () => {
  const { service, prisma } = setup();
  const result = await service.recipients(id);
  expect(prisma.customerWorksite.findUnique).toHaveBeenCalledWith({
    where: { id },
    include: { customer: true, worksite: true },
  });
  expect(result.phones.map((row) => row.value)).toEqual([
    '+573041234567',
    '+573051234567',
    '+573001234567',
    '+573011234567',
    '+573021234567',
    '+573031234567',
  ]);
  expect(result.emails.map((row) => row.value)).toEqual([
    'obra@example.test',
    'docs@example.test',
    'gerencia@example.test',
    'cartera@example.test',
  ]);
  expect(result.phones[0].label).toContain('Residente');
});
it('sends a manually typed WhatsApp recipient through Meta with the exact PDF bytes', async () => {
  const { service, transport, mail, idempotency } = setup();
  expect(
    await service.send(id, { ...body, recipient: '3061234567' }, file, 'user'),
  ).toMatchObject({
    sent: true,
    recipient: '+573061234567',
    status: 'accepted',
  });
  expect(transport.sendWhatsappPdf).toHaveBeenCalledWith(
    '+573061234567',
    expect.objectContaining({ title: expect.stringContaining('Obra Norte') }),
    file.buffer,
    'Anexo-2026-11-01-2026-11-03.pdf',
  );
  expect(mail.sendMail).not.toHaveBeenCalled();
  expect(idempotency.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      key: body.requestId,
      userId: 'user',
      operation: expect.stringMatching(/^annexes.send:[a-f0-9]{64}$/),
    }),
  );
});
it('sends email directly with an attachment and escaped client names', async () => {
  const { service, mail, transport } = setup();
  await service.send(
    id,
    { ...body, channel: 'EMAIL', recipient: ' Other@Example.test ' },
    file,
    'user',
  );
  expect(mail.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'other@example.test',
      html: expect.stringContaining('&lt;Uno&gt;'),
      attachments: [
        {
          filename: 'Anexo-2026-11-01-2026-11-03.pdf',
          content: file.buffer,
          contentType: 'application/pdf',
        },
      ],
    }),
  );
  expect(transport.sendWhatsappPdf).not.toHaveBeenCalled();
});
it.each([
  { ...body, recipient: 'bad' },
  { ...body, channel: 'EMAIL', recipient: 'bad' },
  { ...body, through: '2026-12-01' },
  { ...body, from: '2026-02-30' },
  { ...body, requestId: 'bad' },
  { ...body, channel: 'SMS' },
])(
  'rejects invalid recipients and metadata before provider calls',
  async (payload) => {
    const { service, mail, transport } = setup();
    await expect(service.send(id, payload, file, 'user')).rejects.toThrow();
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(transport.sendWhatsappPdf).not.toHaveBeenCalled();
  },
);
it.each([
  undefined,
  { ...file, mimetype: 'text/html' },
  { ...file, buffer: Buffer.from('fake pdf') },
  { ...file, buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
])('rejects missing, disguised or oversized attachments', async (upload) => {
  const { service, transport } = setup();
  await expect(service.send(id, body, upload, 'user')).rejects.toThrow('PDF');
  expect(transport.sendWhatsappPdf).not.toHaveBeenCalled();
});
it('reports missing Meta configuration instead of claiming that the message was sent', async () => {
  const { service, transport } = setup();
  transport.sendWhatsappPdf.mockResolvedValueOnce({
    sent: false,
    reason: 'missing-meta-document-config',
  } as never);
  await expect(service.send(id, body, file, 'user')).rejects.toThrow('Meta');
});
it('reports mail configuration errors and external provider failures without exposing credentials', async () => {
  const { service, mail, transport } = setup();
  mail.sendMail.mockResolvedValueOnce({ sent: false } as never);
  await expect(
    service.send(
      id,
      { ...body, channel: 'EMAIL', recipient: 'a@example.test' },
      file,
      'user',
    ),
  ).rejects.toThrow('correo');
  transport.sendWhatsappPdf.mockRejectedValueOnce(
    new Error('credential-secret'),
  );
  await expect(service.send(id, body, file, 'user')).rejects.toThrow(
    'El proveedor no confirmó',
  );
});
it('rejects missing worksites', async () => {
  const { service, prisma } = setup();
  prisma.customerWorksite.findUnique.mockResolvedValueOnce(null as never);
  await expect(service.recipients(id)).rejects.toThrow('Obra no encontrada');
});
