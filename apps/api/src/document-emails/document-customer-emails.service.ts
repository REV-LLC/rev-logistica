import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  NotificationDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { DocumentPdfSnapshotService } from '../documents/document-pdf-snapshot.service';
import { MailAttachment, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

type DocumentForEmail = Prisma.DocumentGetPayload<{
  include: {
    warehouse: { select: { id: true; name: true } };
    customerWorksite: {
      select: {
        id: true;
        alias: true;
        customer: {
          select: { id: true; name: true; email: true; documentsEmail: true };
        };
        worksite: { select: { id: true; name: true; address: true } };
      };
    };
    creator: {
      select: {
        id: true;
        email: true;
        employee: { select: { name: true; lastName: true } };
      };
    };
    files: {
      select: {
        id: true;
        fileType: true;
        category: true;
        displayName: true;
        originalName: true;
        storageKey: true;
        mimeType: true;
      };
    };
    items: {
      include: {
        sku: { select: { id: true; name: true } };
        asset: {
          select: {
            id: true;
            serialOrEngine: true;
            description: true;
            internalNumber: true;
            sku: { select: { id: true; name: true } };
          };
        };
      };
    };
  };
}>;

type EmailKind = 'DRAFT' | 'FINAL';

const CUSTOMER_DOCUMENT_TYPES = new Set<DocumentType>([
  DocumentType.REMISSION,
  DocumentType.RETURN,
]);

@Injectable()
export class DocumentCustomerEmailsService {
  private readonly logger = new Logger(DocumentCustomerEmailsService.name);
  private readonly dateFormatter = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly documentPdfSnapshots: DocumentPdfSnapshotService,
  ) {}

  async sendDraftIfNeeded(documentId: string) {
    return this.sendIfNeeded(documentId, 'DRAFT');
  }

  async sendFinalIfNeeded(documentId: string) {
    return this.sendIfNeeded(documentId, 'FINAL');
  }

  private async sendIfNeeded(documentId: string, kind: EmailKind) {
    const document = await this.loadDocument(documentId);
    if (!document) return { sent: false, reason: 'not-found' as const };
    if (!CUSTOMER_DOCUMENT_TYPES.has(document.type)) {
      return { sent: false, reason: 'unsupported-type' as const };
    }
    if (kind === 'DRAFT' && document.customerDraftEmailedAt) {
      return { sent: false, reason: 'already-sent' as const };
    }
    if (kind === 'FINAL') {
      if (document.status !== DocumentStatus.CONFIRMED) {
        return { sent: false, reason: 'not-confirmed' as const };
      }
      if (document.customerFinalEmailedAt) {
        return { sent: false, reason: 'already-sent' as const };
      }
    }

    const recipient = this.getRecipient(document);
    if (!recipient)
      return { sent: false, reason: 'missing-recipient' as const };

    let deliveryId: string | null = null;
    try {
      const message = await this.buildMessage(document, kind, recipient);
      const delivery = await this.prisma.documentEmailDelivery.upsert({
        where: { documentId_kind: { documentId: document.id, kind } },
        create: {
          documentId: document.id,
          kind,
          email: recipient,
          subject: message.subject,
          attachmentNames: message.attachments.map(
            (attachment) => attachment.filename || 'archivo',
          ),
          status: NotificationDeliveryStatus.SENDING,
        },
        update: {
          email: recipient,
          subject: message.subject,
          attachmentNames: message.attachments.map(
            (attachment) => attachment.filename || 'archivo',
          ),
          status: NotificationDeliveryStatus.SENDING,
          error: null,
        },
        select: { id: true },
      });
      deliveryId = delivery.id;
      const result = await this.mailService.sendMail(message);
      if (!result.sent) {
        await this.prisma.documentEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.FAILED,
            error: result.reason,
          },
        });
        return result;
      }

      const sentAt = new Date();
      await this.prisma.$transaction([
        this.prisma.documentEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.SENT,
            sentAt,
            error: null,
          },
        }),
        this.prisma.document.update({
          where: { id: document.id },
          data:
            kind === 'DRAFT'
              ? { customerDraftEmailedAt: sentAt }
              : { customerFinalEmailedAt: sentAt },
          select: { id: true },
        }),
      ]);
      return { sent: true as const };
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      if (deliveryId) {
        await this.prisma.documentEmailDelivery
          .update({
            where: { id: deliveryId },
            data: {
              status: NotificationDeliveryStatus.FAILED,
              error: messageText.slice(0, 500),
            },
          })
          .catch(() => undefined);
      }
      this.logger.error(
        `Customer document email failed for ${document.id}: ${messageText}`,
      );
      return { sent: false, reason: 'send-failed' as const };
    }
  }

  private loadDocument(documentId: string) {
    return this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        warehouse: { select: { id: true, name: true } },
        customerWorksite: {
          select: {
            id: true,
            alias: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                documentsEmail: true,
              },
            },
            worksite: { select: { id: true, name: true, address: true } },
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            employee: { select: { name: true, lastName: true } },
          },
        },
        files: {
          select: {
            id: true,
            fileType: true,
            category: true,
            displayName: true,
            originalName: true,
            storageKey: true,
            mimeType: true,
          },
          where: {
            fileType: { in: ['SIGNATURE_RECEIVED', 'PHOTO_EVIDENCE'] },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        items: {
          include: {
            sku: { select: { id: true, name: true } },
            asset: {
              select: {
                id: true,
                serialOrEngine: true,
                description: true,
                internalNumber: true,
                sku: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  private getRecipient(document: DocumentForEmail) {
    const email =
      document.customerWorksite?.customer.documentsEmail?.trim() ||
      document.customerWorksite?.customer.email?.trim();
    return email || null;
  }

  private async buildMessage(
    document: DocumentForEmail,
    kind: EmailKind,
    recipient: string,
  ) {
    const documentLabel = this.getDocumentLabel(document.type);
    const statusLabel = kind === 'DRAFT' ? 'borrador' : 'aprobada';
    const number = document.consecutive ?? document.id.slice(0, 8);
    const subject = `${documentLabel} ${number} ${statusLabel}`;
    const photoFiles = document.files.filter(
      (file) => file.fileType === 'PHOTO_EVIDENCE',
    );
    const signatureFiles = document.files.filter(
      (file) => file.fileType === 'SIGNATURE_RECEIVED',
    );
    const pdf = await this.documentPdfSnapshots.getOrCreate(document.id);
    const attachments = [
      {
        filename: pdf.originalName ?? 'documento.pdf',
        path: pdf.storageKey,
        contentType: 'application/pdf',
      },
      ...this.buildAttachments(document),
    ];
    const html = this.buildHtml(document, kind, photoFiles, signatureFiles);
    const text = this.buildText(document, kind, photoFiles, signatureFiles);

    return {
      to: recipient,
      subject,
      html,
      text,
      attachments,
    };
  }

  private buildAttachments(document: DocumentForEmail): MailAttachment[] {
    return document.files
      .filter(
        (file) =>
          file.fileType === 'PHOTO_EVIDENCE' ||
          file.fileType === 'SIGNATURE_RECEIVED',
      )
      .map((file, index) => ({
        filename:
          file.displayName?.trim() ||
          file.originalName?.trim() ||
          `${file.fileType.toLowerCase()}-${index + 1}.${this.extensionFromMime(file.mimeType)}`,
        path: file.storageKey,
        contentType: file.mimeType ?? undefined,
      }));
  }

  private buildHtml(
    document: DocumentForEmail,
    kind: EmailKind,
    photoFiles: DocumentForEmail['files'],
    signatureFiles: DocumentForEmail['files'],
  ) {
    const rows = document.items
      .map((item, index) => {
        const name = this.escapeHtml(this.getItemName(item, index));
        const quantity = this.escapeHtml(this.formatQuantity(item.quantity));
        const note = this.escapeHtml(item.conditionNote ?? '');
        return `<tr><td>${index + 1}</td><td>${name}</td><td>${quantity}</td><td>${note}</td></tr>`;
      })
      .join('');
    const photoLinks = photoFiles.length
      ? photoFiles
          .map((file, index) => {
            const label = this.escapeHtml(
              file.displayName || file.originalName || `Evidencia ${index + 1}`,
            );
            const url = this.escapeHtml(file.storageKey);
            return `<li><a href="${url}">${label}</a></li>`;
          })
          .join('')
      : '<li>Sin fotos adjuntas.</li>';

    return `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.45">
        <h2>${this.escapeHtml(this.getDocumentLabel(document.type))} ${this.escapeHtml(document.consecutive ?? '')}</h2>
        <p>Adjuntamos la copia en PDF ${kind === 'DRAFT' ? 'en borrador' : 'aprobada'} del documento, junto con su evidencia fotográfica y la firma de quien recibe.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          ${this.summaryRow('Cliente', document.customerWorksite?.customer.name)}
          ${this.summaryRow('Obra', document.customerWorksite?.worksite.name)}
          ${this.summaryRow('Direccion', document.customerWorksite?.worksite.address)}
          ${this.summaryRow('Bodega', document.warehouse?.name)}
          ${this.summaryRow('Fecha', this.dateFormatter.format(document.docDate))}
          ${this.summaryRow('Estado', kind === 'DRAFT' ? 'Borrador' : 'Aprobado')}
          ${this.summaryRow('Elaborado por', this.getCreatorName(document))}
        </table>
        <h3>Items</h3>
        <table style="border-collapse:collapse;width:100%;max-width:900px">
          <thead><tr><th>#</th><th>Item</th><th>Cantidad</th><th>Nota</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <h3>Evidencia fotografica</h3>
        <ul>${photoLinks}</ul>
        <p>${
          signatureFiles.length
            ? document.type === DocumentType.RETURN
              ? 'La firma de quien entrega tambien va adjunta.'
              : 'La firma recibida tambien va adjunta.'
            : document.type === DocumentType.RETURN
              ? 'Sin firma de quien entrega adjunta.'
              : 'Sin firma recibida adjunta.'
        }</p>
      </div>
    `.replace(
      /<t([hd])>/g,
      '<t$1 style="border:1px solid #d1d5db;padding:6px 8px;text-align:left">',
    );
  }

  private buildText(
    document: DocumentForEmail,
    kind: EmailKind,
    photoFiles: DocumentForEmail['files'],
    signatureFiles: DocumentForEmail['files'],
  ) {
    const lines = [
      `${this.getDocumentLabel(document.type)} ${document.consecutive ?? document.id}`,
      `Estado: ${kind === 'DRAFT' ? 'Borrador' : 'Aprobado'}`,
      `Cliente: ${document.customerWorksite?.customer.name ?? '-'}`,
      `Obra: ${document.customerWorksite?.worksite.name ?? '-'}`,
      `Fecha: ${this.dateFormatter.format(document.docDate)}`,
      '',
      'Items:',
      ...document.items.map(
        (item, index) =>
          `${index + 1}. ${this.getItemName(item, index)} - ${this.formatQuantity(item.quantity)}`,
      ),
      '',
      'Evidencia fotografica:',
      ...(photoFiles.length
        ? photoFiles.map((file) => file.storageKey)
        : ['Sin fotos adjuntas.']),
      signatureFiles.length
        ? document.type === DocumentType.RETURN
          ? 'Firma de quien entrega adjunta.'
          : 'Firma recibida adjunta.'
        : document.type === DocumentType.RETURN
          ? 'Sin firma de quien entrega adjunta.'
          : 'Sin firma recibida adjunta.',
    ];
    return lines.join('\n');
  }

  private summaryRow(label: string, value?: string | null) {
    return `<tr><th style="border:1px solid #d1d5db;padding:6px 8px;text-align:left">${this.escapeHtml(label)}</th><td style="border:1px solid #d1d5db;padding:6px 8px">${this.escapeHtml(value || '-')}</td></tr>`;
  }

  private getDocumentLabel(type: DocumentType) {
    if (type === DocumentType.REMISSION) return 'Remision';
    if (type === DocumentType.RETURN) return 'Devolucion';
    return 'Documento';
  }

  private getCreatorName(document: DocumentForEmail) {
    const employee = document.creator.employee;
    if (!employee) return document.creator.email;
    return (
      `${employee.name} ${employee.lastName}`.trim() || document.creator.email
    );
  }

  private getItemName(item: DocumentForEmail['items'][number], index: number) {
    if (item.asset) {
      const internal = item.asset.internalNumber
        ? ` #${item.asset.internalNumber}`
        : '';
      return `${item.asset.sku.name}${internal} ${item.asset.serialOrEngine}`.trim();
    }
    if (item.sku)
      return item.requestedTag
        ? `${item.sku.name} (${item.requestedTag})`
        : item.sku.name;
    return item.requestedTag || `Item ${index + 1}`;
  }

  private formatQuantity(value: Prisma.Decimal | null) {
    if (value == null) return '1';
    return Number(value).toLocaleString('es-CO');
  }

  private extensionFromMime(mimeType?: string | null) {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'application/pdf') return 'pdf';
    return 'png';
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
