import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

export interface NotificationMessage {
  title: string;
  body: string;
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
    const url = process.env.NOTIFICATION_SMS_WEBHOOK_URL?.trim()
      || process.env.MAINTENANCE_SMS_WEBHOOK_URL?.trim();
    if (!url) return { sent: false as const, reason: 'missing-config' as const };
    const token = process.env.NOTIFICATION_SMS_WEBHOOK_TOKEN?.trim()
      || process.env.MAINTENANCE_SMS_WEBHOOK_TOKEN?.trim();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ to: phone, message: `${message.title}\n${message.body}` }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      this.logger.warn(`Notification SMS webhook failed (${response.status}): ${detail}`);
      throw new Error(`SMS provider returned ${response.status}`);
    }
    return { sent: true as const };
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char] as string);
  }
}
