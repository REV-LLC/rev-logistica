import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChargeType, DocumentItemBillingStatus, DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrefacturaLineSource = Awaited<ReturnType<BillingService['findRemissionItems']>>[number];

@Injectable()
export class BillingService {
  private readonly dayMs = 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async buildPrefactura(params: {
    customerWorksiteId: string;
    from?: string;
    to?: string;
    ivaRate?: string;
  }) {
    const periodTo = this.parseDate(params.to, 'to') ?? this.todayAtNoonUtc();
    const periodFrom = this.parseDate(params.from, 'from');
    if (periodFrom && periodFrom.getTime() > periodTo.getTime()) {
      throw new BadRequestException('from no puede ser posterior a to');
    }

    const ivaRate = this.parseIvaRate(params.ivaRate);
    const customerWorksite = await this.prisma.customerWorksite.findUnique({
      where: { id: params.customerWorksiteId },
      select: {
        id: true,
        alias: true,
        customer: { select: { id: true, name: true, nitOrId: true } },
        worksite: { select: { id: true, name: true, address: true } },
      },
    });
    if (!customerWorksite) throw new NotFoundException('Obra no encontrada');

    const items = await this.findRemissionItems(params.customerWorksiteId, periodTo);
    const returnsByAssetId = await this.findReturnsByAssetId(
      params.customerWorksiteId,
      items
        .map((item) => item.assetId)
        .filter((assetId): assetId is string => Boolean(assetId)),
      periodTo,
    );

    const lines = items
      .map((item) => this.buildLine(item, returnsByAssetId, periodFrom, periodTo, ivaRate))
      .filter((line): line is NonNullable<typeof line> => Boolean(line));

    const subtotal = this.roundCurrency(lines.reduce((sum, line) => sum + line.subtotal, 0));
    const iva = this.roundCurrency(subtotal * ivaRate);
    const total = this.roundCurrency(subtotal + iva);

    return {
      customerWorksite,
      period: {
        from: periodFrom ? this.toDateKey(periodFrom) : null,
        to: this.toDateKey(periodTo),
      },
      ivaRate,
      totals: {
        subtotal,
        iva,
        total,
      },
      lines,
    };
  }

  findRemissionItems(customerWorksiteId: string, periodTo: Date) {
    return this.prisma.documentItem.findMany({
      where: {
        document: {
          type: DocumentType.REMISSION,
          status: DocumentStatus.CONFIRMED,
          customerWorksiteId,
          docDate: { lte: periodTo },
        },
      },
      orderBy: [{ document: { docDate: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        skuId: true,
        assetId: true,
        quantity: true,
        requestedTag: true,
        billingCutoffDate: true,
        returnedAt: true,
        billingStatus: true,
        billingNote: true,
        document: {
          select: {
            id: true,
            consecutive: true,
            docDate: true,
          },
        },
        sku: {
          select: {
            id: true,
            name: true,
            price: true,
            chargeType: true,
            minimumChargeHours: true,
          },
        },
        asset: {
          select: {
            id: true,
            publicCode: true,
            serialOrEngine: true,
            description: true,
            brand: true,
            model: true,
            internalNumber: true,
            sku: {
              select: {
                id: true,
                name: true,
                price: true,
                chargeType: true,
                minimumChargeHours: true,
              },
            },
          },
        },
      },
    });
  }

  private async findReturnsByAssetId(
    customerWorksiteId: string,
    assetIds: string[],
    periodTo: Date,
  ) {
    if (!assetIds.length) return new Map<string, Date[]>();

    const returnItems = await this.prisma.documentItem.findMany({
      where: {
        assetId: { in: [...new Set(assetIds)] },
        document: {
          type: DocumentType.RETURN,
          status: DocumentStatus.CONFIRMED,
          customerWorksiteId,
          docDate: { lte: periodTo },
        },
      },
      select: {
        assetId: true,
        document: { select: { docDate: true } },
      },
      orderBy: [{ document: { docDate: 'asc' } }, { createdAt: 'asc' }],
    });

    const map = new Map<string, Date[]>();
    returnItems.forEach((item) => {
      if (!item.assetId) return;
      const dates = map.get(item.assetId) ?? [];
      dates.push(item.document.docDate);
      map.set(item.assetId, dates);
    });
    return map;
  }

  private buildLine(
    item: PrefacturaLineSource,
    returnsByAssetId: Map<string, Date[]>,
    periodFrom: Date | null,
    periodTo: Date,
    ivaRate: number,
  ) {
    const sku = item.asset?.sku ?? item.sku;
    if (!sku) return null;

    const deliveredAt = this.asNoonUtc(item.document.docDate);
    const returnedAt =
      item.returnedAt ??
      this.findFirstReturnAfter(returnsByAssetId.get(item.assetId ?? '') ?? [], deliveredAt);
    const effectiveEnd = this.minDate(
      periodTo,
      item.billingCutoffDate ?? null,
      returnedAt,
    );
    const effectiveStart = this.maxDate(deliveredAt, periodFrom);
    if (effectiveStart.getTime() > effectiveEnd.getTime()) return null;

    const days = this.diffDaysInclusive(effectiveStart, effectiveEnd);
    const unitPrice = this.decimalToNumber(sku.price);
    const quantity = item.assetId ? 1 : this.decimalToNumber(item.quantity) || 1;
    const chargeType = sku.chargeType ?? ChargeType.DAY;
    const minimumChargeHours = this.decimalToNumber(sku.minimumChargeHours);
    const billableUnits =
      chargeType === ChargeType.HOUR
        ? Math.max(days * 24, minimumChargeHours || 0)
        : days;
    const subtotal = this.roundCurrency(quantity * billableUnits * unitPrice);
    const iva = this.roundCurrency(subtotal * ivaRate);

    return {
      documentId: item.document.id,
      documentConsecutive: item.document.consecutive,
      documentItemId: item.id,
      skuId: sku.id,
      skuName: sku.name,
      assetId: item.asset?.id ?? null,
      publicCode: item.asset?.publicCode ?? null,
      internalNumber: item.asset?.internalNumber ?? null,
      serialOrEngine: item.asset?.serialOrEngine ?? null,
      description:
        item.asset?.description ??
        ([item.asset?.brand, item.asset?.model].filter(Boolean).join(' ') || null),
      requestedTag: item.requestedTag,
      from: this.toDateKey(effectiveStart),
      to: this.toDateKey(effectiveEnd),
      deliveredAt: this.toDateKey(deliveredAt),
      returnedAt: returnedAt ? this.toDateKey(returnedAt) : null,
      billingCutoffDate: item.billingCutoffDate ? this.toDateKey(item.billingCutoffDate) : null,
      billingStatus: this.resolveBillingStatus(item.billingStatus, returnedAt, item.billingCutoffDate),
      billingNote: item.billingNote,
      quantity,
      days,
      chargeType,
      billableUnits,
      unitPrice,
      subtotal,
      iva,
      total: this.roundCurrency(subtotal + iva),
    };
  }

  private resolveBillingStatus(
    status: DocumentItemBillingStatus,
    returnedAt: Date | null,
    billingCutoffDate: Date | null,
  ) {
    if (status === DocumentItemBillingStatus.CLOSED || returnedAt) return DocumentItemBillingStatus.CLOSED;
    if (status === DocumentItemBillingStatus.CUT || billingCutoffDate) return DocumentItemBillingStatus.CUT;
    return DocumentItemBillingStatus.OPEN;
  }

  private parseDate(value: string | undefined, fieldName: string) {
    if (!value?.trim()) return null;
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new BadRequestException(`${fieldName} debe tener formato yyyy-mm-dd`);
    const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${fieldName} inválida`);
    return parsed;
  }

  private parseIvaRate(value?: string) {
    if (!value?.trim()) return 0.19;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new BadRequestException('ivaRate debe estar entre 0 y 1');
    }
    return parsed;
  }

  private decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
    if (value == null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private todayAtNoonUtc() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  }

  private asNoonUtc(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
  }

  private maxDate(first: Date, second: Date | null) {
    if (!second) return first;
    return first.getTime() >= second.getTime() ? first : second;
  }

  private minDate(first: Date, ...others: Array<Date | null>): Date {
    return others.reduce<Date>((current, value) => {
      if (!value) return current;
      return value.getTime() < current.getTime() ? value : current;
    }, first);
  }

  private findFirstReturnAfter(returnDates: Date[], deliveredAt: Date) {
    return returnDates.find((date) => this.asNoonUtc(date).getTime() >= deliveredAt.getTime()) ?? null;
  }

  private diffDaysInclusive(from: Date, to: Date) {
    return Math.floor((this.asNoonUtc(to).getTime() - this.asNoonUtc(from).getTime()) / this.dayMs) + 1;
  }

  private toDateKey(value: Date) {
    return this.asNoonUtc(value).toISOString().slice(0, 10);
  }

  private roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
