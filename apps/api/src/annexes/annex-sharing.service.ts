import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationTransportService } from '../notifications/notification-transport.service';
import { IdempotencyService } from '../common/idempotency.service';
import { civilDate } from '../common/civil-date';
import {
  normalizeRequiredColombianPhone,
  normalizeStoredColombianPhone,
} from '../messaging/colombian-phone';
const sendSchema = z
  .object({
    channel: z.enum(['WHATSAPP', 'EMAIL']),
    recipient: z.string().trim().min(1).max(254),
    from: z.string(),
    to: z.string(),
    through: z.string(),
    requestId: z.string().uuid(),
  })
  .strict();
export type AnnexPdfUpload = { buffer: Buffer; mimetype: string };
@Injectable()
export class AnnexSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly transport: NotificationTransportService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private async worksite(id: string) {
    if (!z.string().uuid().safeParse(id).success)
      throw new BadRequestException('Obra inválida');
    const site = await this.prisma.customerWorksite.findUnique({
      where: { id },
      include: { customer: true, worksite: true },
    });
    if (!site) throw new NotFoundException('Obra no encontrada');
    return site;
  }
  async recipients(id: string) {
    const { customer, worksite } = await this.worksite(id);
    const phones = new Map<string, string>(),
      emails = new Map<string, string>();
    const add = (
      label: string,
      phone?: string | null,
      email?: string | null,
    ) => {
      const number = normalizeStoredColombianPhone(phone);
      const address = email?.trim().toLowerCase();
      if (number && !phones.has(number))
        phones.set(number, `${label} · ${number}`);
      if (
        address &&
        z.string().email().safeParse(address).success &&
        !emails.has(address)
      )
        emails.set(address, `${label} · ${address}`);
    };
    const worksiteLabel = `Obra${worksite.contactName ? ` · ${worksite.contactName}` : ''}`;
    add(worksiteLabel, worksite.phone, worksite.email);
    add(`${worksiteLabel} · alterno`, worksite.alternatePhone);
    add(
      'Cliente · documentos',
      customer.documentsPhone,
      customer.documentsEmail,
    );
    add(`Cliente · ${customer.name}`, customer.phone, customer.email);
    add('Cliente · facturación', customer.billingPhone);
    add('Cliente · facturación alterno', customer.billingAlternatePhone);
    if (Array.isArray(customer.contactDirectory))
      for (const entry of customer.contactDirectory) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
          continue;
        add(
          `Cliente · ${typeof entry.label === 'string' ? entry.label : 'Contacto'}`,
          typeof entry.phone === 'string' ? entry.phone : null,
          typeof entry.email === 'string' ? entry.email : null,
        );
      }
    return {
      phones: [...phones].map(([value, label]) => ({ value, label })),
      emails: [...emails].map(([value, label]) => ({ value, label })),
    };
  }
  async send(
    id: string,
    body: unknown,
    file: AnnexPdfUpload | undefined,
    userId: string,
  ) {
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        'Revisa el destino, el canal y las fechas del anexo',
      );
    const input = parsed.data;
    [input.from, input.to, input.through].forEach(civilDate);
    if (input.from > input.through || input.through > input.to)
      throw new BadRequestException('El corte del anexo no es válido');
    if (
      !file ||
      file.mimetype !== 'application/pdf' ||
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.length < 5 ||
      file.buffer.length > 10 * 1024 * 1024 ||
      file.buffer.subarray(0, 5).toString() !== '%PDF-'
    ) {
      throw new BadRequestException(
        'Adjunta el PDF del anexo, de máximo 10 MB',
      );
    }
    const recipient =
      input.channel === 'WHATSAPP'
        ? normalizeRequiredColombianPhone(input.recipient)
        : input.recipient.toLowerCase();
    if (
      input.channel === 'EMAIL' &&
      !z.string().email().safeParse(recipient).success
    )
      throw new BadRequestException('Escribe un correo válido');
    const site = await this.worksite(id);
    const worksiteName = site.alias || site.worksite.name;
    const filename = `Anexo-${input.from}-${input.through}.pdf`;
    const subject = `Anexo de alquiler · ${worksiteName} · ${input.from} al ${input.through}`;
    const text = `${subject}\nCliente: ${site.customer.name}\nSe adjunta el anexo para revisión.`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ id, ...input, requestId: undefined, recipient }))
      .update(file.buffer)
      .digest('hex');
    return this.idempotency.execute({
      key: input.requestId,
      userId,
      operation: `annexes.send:${fingerprint}`,
      run: async () => {
        try {
          if (input.channel === 'EMAIL') {
            const response = await this.mail.sendMail({
              to: recipient,
              subject,
              text,
              html: `<p>${text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]!).replace(/\n/g, '<br>')}</p>`,
              attachments: [
                {
                  filename,
                  content: file.buffer,
                  contentType: 'application/pdf',
                },
              ],
            });
            if (!response.sent)
              throw new ServiceUnavailableException(
                'El servicio de correo no está configurado para enviar anexos',
              );
            return {
              sent: true,
              channel: input.channel,
              recipient,
              status: 'sent',
            };
          }
          const response = await this.transport.sendWhatsappPdf(
            recipient,
            { title: subject, body: text, recipientName: site.customer.name },
            file.buffer,
            filename,
          );
          if (!response.sent)
            throw new ServiceUnavailableException(
              'WhatsApp requiere la configuración de Meta y la plantilla de documentos de la aplicación',
            );
          return {
            sent: true,
            channel: input.channel,
            recipient,
            status: 'accepted',
            providerMessageId: response.providerMessageId ?? null,
          };
        } catch (error) {
          if (error instanceof ServiceUnavailableException) throw error;
          throw new BadGatewayException(
            'El proveedor no confirmó el envío. Revisa el destino e inténtalo nuevamente.',
          );
        }
      },
    });
  }
}
