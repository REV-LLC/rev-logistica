import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

export interface NotificationMessage {
  title: string;
  body: string;
  link?: string;
  recipientName?: string;
}

@Injectable()
export class NotificationTransportService {
  private readonly logger = new Logger(NotificationTransportService.name);

  constructor(private readonly mailService: MailService) {}

  sendEmail(to: string, message: NotificationMessage) {
    return this.mailService.sendMail({
      to,
      subject: message.title,
      text: message.body,
      html: `<p>${this.escapeHtml(message.body).replace(/\n/g, '<br>')}</p>`,
    });
  }

  async sendSms(phone: string, message: NotificationMessage) {
    return this.sendMessagingWebhook('SMS', phone, message, {
      url: process.env.NOTIFICATION_SMS_WEBHOOK_URL?.trim()
        || process.env.MAINTENANCE_SMS_WEBHOOK_URL?.trim()
        || process.env.MESSAGING_WEBHOOK_URL?.trim(),
      token: process.env.NOTIFICATION_SMS_WEBHOOK_TOKEN?.trim()
        || process.env.MAINTENANCE_SMS_WEBHOOK_TOKEN?.trim()
        || process.env.MESSAGING_WEBHOOK_TOKEN?.trim(),
    });
  }

  async sendWhatsapp(phone: string, message: NotificationMessage) {
    const metaConfig = {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim(),
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
      templateName: process.env.WHATSAPP_TEMPLATE_NAME?.trim(),
      templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'es_CO',
      apiVersion: process.env.WHATSAPP_API_VERSION?.trim(),
    };
    if (
      metaConfig.accessToken
      && metaConfig.phoneNumberId
      && metaConfig.templateName
      && metaConfig.apiVersion
    ) {
      return this.sendMetaWhatsapp(phone, message, metaConfig as {
        accessToken: string;
        phoneNumberId: string;
        templateName: string;
        templateLanguage: string;
        apiVersion: string;
      });
    }
    return this.sendMessagingWebhook('WHATSAPP', phone, message, {
      url: process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL?.trim()
        || process.env.MESSAGING_WEBHOOK_URL?.trim(),
      token: process.env.NOTIFICATION_WHATSAPP_WEBHOOK_TOKEN?.trim()
        || process.env.MESSAGING_WEBHOOK_TOKEN?.trim(),
    });
  }

  private async sendMetaWhatsapp(
    phone: string,
    message: NotificationMessage,
    config: {
      accessToken: string;
      phoneNumberId: string;
      templateName: string;
      templateLanguage: string;
      apiVersion: string;
    },
  ) {
    const response = await fetch(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone.replace(/\D/g, ''),
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.templateLanguage },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: message.recipientName || 'usuario' },
                { type: 'text', text: `${message.title}. ${message.body}` },
              ],
            }, {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: this.dynamicButtonValue(message.link) }],
            }],
          },
        }),
      },
    );
    const responseBody = await response.text();
    if (!response.ok) {
      this.logger.warn(
        `Meta WhatsApp API failed (${response.status}): ${responseBody.slice(0, 300)}`,
      );
      throw new Error(`Meta WhatsApp API returned ${response.status}`);
    }
    const parsed = responseBody ? JSON.parse(responseBody) : {};
    return {
      sent: true as const,
      providerMessageId: parsed.messages?.[0]?.id as string | undefined,
    };
  }

  private async sendMessagingWebhook(
    channel: 'SMS' | 'WHATSAPP',
    phone: string,
    message: NotificationMessage,
    config: { url?: string; token?: string },
  ) {
    if (!config.url) return { sent: false as const, reason: 'missing-config' as const };
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        channel,
        to: phone,
        message: `${message.title}\n${message.body}`,
        ...(message.link ? { link: message.link } : {}),
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      this.logger.warn(`Notification ${channel} webhook failed (${response.status}): ${detail}`);
      throw new Error(`${channel} provider returned ${response.status}`);
    }
    return { sent: true as const };
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char] as string);
  }

  private dynamicButtonValue(link?: string) {
    if (!link) return '?source=whatsapp';
    const publicWebUrl = process.env.PUBLIC_WEB_URL?.trim()?.replace(/\/+$/, '');
    if (publicWebUrl && link.startsWith(`${publicWebUrl}/`)) {
      return link.slice(publicWebUrl.length + 1);
    }
    try {
      const parsed = new URL(link);
      return `${parsed.pathname.replace(/^\/+/, '')}${parsed.search}${parsed.hash}`;
    } catch {
      return link.replace(/^\/+/, '');
    }
  }
}
