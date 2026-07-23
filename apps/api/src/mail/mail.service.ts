import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';

export type MailAttachment = Mail.Attachment;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private missingConfigLogged = false;

  private getTransportConfig(): SMTPTransport.Options | null {
    const host = process.env.SMTP_HOST?.trim();
    const from = process.env.MAIL_FROM?.trim();
    if (!host || !from) return null;

    const port = Number(process.env.SMTP_PORT ?? 587);
    const secureInput = process.env.SMTP_SECURE?.trim().toLowerCase();
    const secure =
      secureInput === 'true' ||
      secureInput === '1' ||
      secureInput === 'yes' ||
      port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;

    return {
      host,
      port: Number.isFinite(port) ? port : 587,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    };
  }

  getFromAddress() {
    const from = process.env.MAIL_FROM?.trim();
    const fromName = process.env.MAIL_FROM_NAME?.trim();
    if (!from) return null;
    return fromName ? `"${fromName.replace(/"/g, '\\"')}" <${from}>` : from;
  }

  async sendMail(message: {
    to: string | string[];
    subject: string;
    text: string;
    html: string;
    attachments?: MailAttachment[];
  }) {
    const config = this.getTransportConfig();
    const from = this.getFromAddress();
    if (!config || !from) {
      if (!this.missingConfigLogged) {
        this.logger.warn(
          'SMTP_HOST and MAIL_FROM are required to send emails',
        );
        this.missingConfigLogged = true;
      }
      return { sent: false, reason: 'missing-config' as const };
    }

    const transporter = nodemailer.createTransport(config);
    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments,
    });

    return { sent: true as const };
  }
}
