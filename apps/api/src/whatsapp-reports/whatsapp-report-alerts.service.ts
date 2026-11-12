import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTransportService } from '../notifications/notification-transport.service';
import { assetLabel, readableDescription } from './whatsapp-equipment';
import { normalizePhone, REPORT_LABELS } from './whatsapp-report.types';

@Injectable()
export class WhatsappReportAlertsService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(WhatsappReportAlertsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly transport: NotificationTransportService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running || process.env.WHATSAPP_REPORTS_ENABLED !== 'true') return;
    this.running = true;
    try {
      await this.prisma.whatsappReportAlertRecipient.updateMany({
        where: { status: 'SENDING', nextAttemptAt: { lt: new Date() } },
        data: { status: 'PENDING' },
      });
      const recipients =
        await this.prisma.whatsappReportAlertRecipient.findMany({
          where: {
            status: 'PENDING',
            nextAttemptAt: { lte: new Date() },
            report: { status: 'RECORDED' },
          },
          take: 20,
          orderBy: { nextAttemptAt: 'asc' },
          include: {
            report: {
              include: {
                employee: true,
                asset: { include: { sku: { select: { name: true } } } },
                vehicle: true,
              },
            },
          },
        });
      for (const r of recipients) {
        const claim = await this.prisma.whatsappReportAlertRecipient.updateMany(
          {
            where: {
              id: r.id,
              status: 'PENDING',
              nextAttemptAt: { lte: new Date() },
            },
            data: {
              status: 'SENDING',
              attempts: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + 180000),
            },
          },
        );
        if (!claim.count) continue;
        try {
          // Don't dispatch to a deactivated employee/account or a phone changed since creation.
          const employee = r.employeeId
            ? await this.prisma.employee.findFirst({
                where: { id: r.employeeId, active: true },
              })
            : null;
          if (r.employeeId && !employee) throw new Error('Recipient inactive');
          if (
            r.userId &&
            !(await this.prisma.user.findFirst({
              where: { id: r.userId, active: true },
            }))
          )
            throw new Error('Recipient account inactive');
          if (employee && normalizePhone(employee.phone) !== r.phone)
            throw new Error('Recipient phone changed');
          const base = (
            process.env.APP_BASE_URL ||
            process.env.FRONTEND_URL ||
            ''
          ).replace(/\/+$/, '');
          const result = await this.transport.sendWhatsapp(r.phone!, {
            title: `${REPORT_LABELS[r.report.kind]}: ${r.report.employee.name} ${r.report.employee.lastName}`,
            body: `${r.report.asset ? assetLabel(r.report.asset) : r.report.vehicle ? `Vehículo ${r.report.vehicle.plate}` : ''} ${readableDescription(r.report.description, r.report.asset?.publicCode)}`.trim(),
            recipientName: r.name,
            link: `${base}/employees/whatsapp-reports`,
          });
          if (!result.sent) throw new Error('Transport unavailable');
          await this.prisma.whatsappReportAlertRecipient.update({
            where: { id: r.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              providerMessageId:
                'providerMessageId' in result
                  ? (result.providerMessageId ?? null)
                  : null,
              error: null,
            },
          });
        } catch {
          await this.prisma.whatsappReportAlertRecipient.update({
            where: { id: r.id },
            data: {
              status: r.attempts >= 4 ? 'FAILED' : 'PENDING',
              error: 'ALERT_SEND_FAILED',
              nextAttemptAt: new Date(Date.now() + 180000),
            },
          });
          this.logger.warn({
            event: 'whatsapp_report_alert_failed',
            recipientId: r.id,
          });
        }
      }
    } catch {
      this.logger.error('WhatsApp alert worker failed; alerts remain stored');
    } finally {
      this.running = false;
    }
  }
}
