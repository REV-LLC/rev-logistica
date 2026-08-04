import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type Mail from 'nodemailer/lib/mailer';

export type MailAttachment = Mail.Attachment;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private missingConfigLogged = false;
  private zohoAccessToken?: { value: string; expiresAt: number };

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
    if (process.env.MAIL_PROVIDER?.trim().toLowerCase() === 'zoho-api') {
      return this.sendWithZohoApi(message);
    }

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

  private async sendWithZohoApi(message: {
    to: string | string[];
    subject: string;
    text: string;
    html: string;
    attachments?: MailAttachment[];
  }) {
    const accountId = process.env.ZOHO_ACCOUNT_ID?.trim();
    const fromAddress = process.env.MAIL_FROM?.trim();
    if (!accountId || !fromAddress || !this.hasZohoOAuthConfig()) {
      return { sent: false, reason: 'missing-zoho-config' as const };
    }

    const accessToken = await this.getZohoAccessToken();
    const attachments = await Promise.all(
      (message.attachments ?? []).map((attachment) =>
        this.uploadZohoAttachment(accountId, accessToken, attachment),
      ),
    );
    const response = await fetch(
      `${this.zohoMailBaseUrl()}/api/accounts/${encodeURIComponent(accountId)}/messages`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fromAddress,
          toAddress: Array.isArray(message.to) ? message.to.join(',') : message.to,
          subject: message.subject,
          content: message.html || message.text,
          mailFormat: message.html ? 'html' : 'plaintext',
          attachments,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    await this.assertZohoResponse(response, 'send-email');
    return { sent: true as const };
  }

  private hasZohoOAuthConfig() {
    return Boolean(
      process.env.ZOHO_CLIENT_ID?.trim() &&
        process.env.ZOHO_CLIENT_SECRET?.trim() &&
        process.env.ZOHO_REFRESH_TOKEN?.trim(),
    );
  }

  private async getZohoAccessToken() {
    if (this.zohoAccessToken && this.zohoAccessToken.expiresAt > Date.now()) {
      return this.zohoAccessToken.value;
    }

    const params = new URLSearchParams({
      client_id: process.env.ZOHO_CLIENT_ID!.trim(),
      client_secret: process.env.ZOHO_CLIENT_SECRET!.trim(),
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!.trim(),
      grant_type: 'refresh_token',
    });
    const response = await fetch(`${this.zohoAccountsBaseUrl()}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new Error(`Zoho OAuth failed: ${payload.error ?? response.status}`);
    }

    this.zohoAccessToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, (payload.expires_in ?? 3600) - 60) * 1000,
    };
    return this.zohoAccessToken.value;
  }

  private async uploadZohoAttachment(
    accountId: string,
    accessToken: string,
    attachment: MailAttachment,
  ) {
    const filename = attachment.filename || 'archivo';
    const content = await this.resolveAttachmentContent(attachment);
    const query = new URLSearchParams({ fileName: filename, isInline: 'false' });
    const response = await fetch(
      `${this.zohoMailBaseUrl()}/api/accounts/${encodeURIComponent(accountId)}/messages/attachments?${query}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(content),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const payload = await this.assertZohoResponse(response, 'upload-attachment');
    const uploaded = Array.isArray(payload.data) ? payload.data[0] : payload.data;
    if (!uploaded?.storeName || !uploaded?.attachmentPath || !uploaded?.attachmentName) {
      throw new Error('Zoho attachment upload returned incomplete metadata');
    }
    return {
      storeName: uploaded.storeName,
      attachmentPath: uploaded.attachmentPath,
      attachmentName: uploaded.attachmentName,
    };
  }

  private async resolveAttachmentContent(attachment: MailAttachment) {
    if (Buffer.isBuffer(attachment.content)) return attachment.content;
    if (typeof attachment.content === 'string') return Buffer.from(attachment.content);
    if (typeof attachment.path === 'string') {
      if (attachment.path.startsWith('data:')) {
        const match = attachment.path.match(/^data:[^;,]+(;base64)?,(.*)$/s);
        if (!match) throw new Error(`Invalid data attachment: ${attachment.filename}`);
        return Buffer.from(decodeURIComponent(match[2]), match[1] ? 'base64' : 'utf8');
      }
      const response = await fetch(attachment.path, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Attachment download failed (${response.status}): ${attachment.filename}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error(`Unsupported attachment source: ${attachment.filename}`);
  }

  private async assertZohoResponse(response: Response, operation: string) {
    const payload = (await response.json()) as {
      status?: { code?: number; description?: string };
      data?: any;
    };
    const apiCode = Number(payload.status?.code ?? response.status);
    if (!response.ok || apiCode >= 400) {
      throw new Error(
        `Zoho ${operation} failed: ${payload.status?.description ?? apiCode}`,
      );
    }
    return payload;
  }

  private zohoAccountsBaseUrl() {
    return (process.env.ZOHO_ACCOUNTS_BASE_URL ?? 'https://accounts.zoho.com').replace(/\/$/, '');
  }

  private zohoMailBaseUrl() {
    return (process.env.ZOHO_MAIL_BASE_URL ?? 'https://mail.zoho.com').replace(/\/$/, '');
  }
}
