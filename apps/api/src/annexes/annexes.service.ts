import { assertDailyAnnex } from './annex-daily-scope';
import { validateWorksiteRates } from './annex-customer-pricing';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { annexInputSchema } from './annex-input';
import { calculateAnnex } from './annex-engine';
import { minimumSettings, worksiteMinimumKey } from './annex-minimums';
const invoiceNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^\r\n\x00-\x1F]+$/)
  .transform((value) => value.toLocaleUpperCase('es-CO'))
  .pipe(z.string().max(80));
const saveSchema = z
  .object({
    customerWorksiteId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    invoiceNumber: invoiceNumberSchema.nullable().optional(),
    reason: z.string().trim().min(1).max(500),
    input: annexInputSchema,
    sourceIssues: z
      .array(
        z
          .object({
            code: z.string().max(100),
            reference: z.string().max(200),
            message: z.string().max(500),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
  })
  .strict();
@Injectable()
export class AnnexesService {
  constructor(private readonly prisma: PrismaService) {}
  async list(customerWorksiteId: string) {
    if (!z.string().uuid().safeParse(customerWorksiteId).success)
      throw new BadRequestException('Obra inválida');
    return this.prisma.annexDraft.findMany({
      where: { customerWorksiteId },
      orderBy: { periodFrom: 'desc' },
      take: 100,
      include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } },
    });
  }
  async library(query: {
    customerId?: string;
    customerWorksiteId?: string;
    cursor?: string;
  }) {
    const parsed = z
      .object({
        customerId: z.string().uuid().optional(),
        customerWorksiteId: z.string().uuid().optional(),
        cursor: z.string().uuid().optional(),
      })
      .strict()
      .safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        'El cliente, la obra o la página no son válidos',
      );
    const { customerId, customerWorksiteId, cursor } = parsed.data;
    if (customerWorksiteId) {
      const site = await this.prisma.customerWorksite.findUnique({
        where: { id: customerWorksiteId },
        select: {
          id: true,
          alias: true,
          customer: { select: { id: true, name: true } },
          worksite: { select: { name: true } },
        },
      });
      if (!site || (customerId && site.customer.id !== customerId))
        throw new NotFoundException(
          'La obra no pertenece al cliente seleccionado',
        );
      if (
        cursor &&
        !(await this.prisma.annexDraft.findFirst({
          where: { id: cursor, customerWorksiteId },
          select: { id: true },
        }))
      )
        throw new BadRequestException('Página de anexos inválida');
      const rows = await this.prisma.annexDraft.findMany({
        where: { customerWorksiteId },
        orderBy: [{ periodFrom: 'desc' }, { id: 'desc' }],
        take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          revision: true,
          periodFrom: true,
          periodTo: true,
          revisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: {
              revision: true,
              through: true,
              invoiceNumber: true,
              createdAt: true,
            },
          },
        },
      });
      return {
        customer: site.customer,
        worksite: { id: site.id, name: site.alias || site.worksite.name },
        annexes: rows.slice(0, 50),
        nextCursor: rows.length > 50 ? rows[49].id : null,
      };
    }
    if (cursor)
      throw new BadRequestException(
        'Selecciona una obra para consultar sus anexos',
      );
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          customerWorksites: {
            orderBy: { worksite: { name: 'asc' } },
            select: {
              id: true,
              alias: true,
              worksite: { select: { name: true } },
              _count: { select: { annexDrafts: true } },
            },
          },
        },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      return {
        customer: { id: customer.id, name: customer.name },
        worksites: customer.customerWorksites.map((site) => ({
          id: site.id,
          name: site.alias || site.worksite.name,
          annexCount: site._count.annexDrafts,
        })),
      };
    }
    return {
      customers: (
        await this.prisma.customer.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            _count: { select: { customerWorksites: true } },
          },
        })
      ).map((customer) => ({
        id: customer.id,
        name: customer.name,
        worksiteCount: customer._count.customerWorksites,
      })),
    };
  }
  async get(id: string) {
    const draft = await this.prisma.annexDraft.findUnique({
      where: { id },
      include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    if (!draft) throw new NotFoundException('Borrador no encontrado');
    return draft;
  }
  async history(id: string) {
    await this.get(id);
    return this.prisma.annexDraftRevision.findMany({
      where: { draftId: id },
      orderBy: { revision: 'desc' },
      select: {
        revision: true,
        through: true,
        reason: true,
        createdBy: true,
        createdAt: true,
        invoiceNumber: true,
      },
    });
  }
  /** Tag a saved historical snapshot without recalculating unsupported rental modes. */
  async assignStoredInvoice(id: string, value: unknown, userId: string) {
    const parsed = z
      .object({
        expectedRevision: z.number().int().positive(),
        invoiceNumber: invoiceNumberSchema,
      })
      .strict()
      .safeParse(value);
    if (!parsed.success)
      throw new BadRequestException('Número de factura o versión inválidos.');
    const { expectedRevision, invoiceNumber } = parsed.data;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT s.id FROM "CustomerWorksite" s JOIN "AnnexDraft" d ON d."customerWorksiteId"=s.id WHERE d.id=${id} FOR UPDATE OF s`,
      );
      const claimed = await tx.annexDraft.updateMany({
        where: { id, revision: expectedRevision },
        data: { revision: { increment: 1 } },
      });
      if (!claimed.count)
        throw new ConflictException(
          'El anexo cambió. Vuelve a abrirlo antes de asignar la factura.',
        );
      const previous = await tx.annexDraftRevision.findUniqueOrThrow({
        where: {
          draftId_revision: { draftId: id, revision: expectedRevision },
        },
      });
      if (previous.invoiceNumber)
        throw new ConflictException('El anexo ya tiene una factura asignada.');
      await tx.annexDraftRevision.create({
        data: {
          draftId: id,
          revision: expectedRevision + 1,
          through: previous.through,
          invoiceNumber,
          input: previous.input as Prisma.InputJsonValue,
          result: previous.result as Prisma.InputJsonValue,
          sourceIssues: previous.sourceIssues as Prisma.InputJsonValue,
          reason: 'Asignación de factura ' + invoiceNumber,
          createdBy: userId,
        },
      });
      return tx.annexDraft.findUniqueOrThrow({
        where: { id },
        include: { revisions: { orderBy: { revision: 'desc' }, take: 1 } },
      });
    });
  }
  async save(value: unknown, userId: string) {
    const parsed = saveSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const {
      input,
      customerWorksiteId,
      expectedRevision,
      reason,
      sourceIssues,
    } = parsed.data;
    assertDailyAnnex(input);
    const result = calculateAnnex(input);
    const periodFrom = new Date(`${input.period.from}T00:00:00Z`);
    const periodTo = new Date(`${input.period.to}T00:00:00Z`);
    return this.prisma.$transaction(async (tx) => {
      const site = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM "CustomerWorksite" WHERE id = ${customerWorksiteId} FOR UPDATE
      `);
      if (!site.length) throw new NotFoundException('Obra no encontrada');
      const employeeIds = [
        ...new Set(
          input.machineDays.flatMap((day) =>
            day.reports.map((report) => report.employeeId),
          ),
        ),
      ];
      if (
        employeeIds.length &&
        (await tx.employee.count({ where: { id: { in: employeeIds } } })) !==
          employeeIds.length
      ) {
        throw new BadRequestException(
          'Hay operarios que no existen en el registro de empleados',
        );
      }
      const skuIds = [
        ...new Set(
          input.rentals
            .filter((rental) => !rental.accessoryId)
            .map((rental) => rental.skuId),
        ),
      ];
      if (
        skuIds.length &&
        (await tx.sku.count({ where: { id: { in: skuIds } } })) !==
          skuIds.length
      ) {
        throw new BadRequestException(
          'Hay referencias que no existen en el catálogo',
        );
      }
      const accessoryIds = [
        ...new Set([
          ...input.rentals.flatMap((r) =>
            r.accessoryId ? [r.accessoryId] : [],
          ),
          ...input.machineDays.flatMap((d) =>
            d.rentalContext?.accessoryId ? [d.rentalContext.accessoryId] : [],
          ),
        ]),
      ];
      if (
        accessoryIds.length &&
        (await tx.accessory.count({ where: { id: { in: accessoryIds } } })) !==
          accessoryIds.length
      )
        throw new BadRequestException(
          'Hay accesorios inexistentes en el anexo',
        );
      const assetIds = [
        ...new Set([
          ...input.machineDays
            .filter((day) => !day.rentalContext?.accessoryId)
            .map((day) => day.assetId),
          ...input.rentals.flatMap((rental) =>
            rental.assetId ? [rental.assetId] : [],
          ),
        ]),
      ];
      const assets = assetIds.length
        ? await tx.asset.findMany({
            where: { id: { in: assetIds } },
            select: { id: true, skuId: true },
          })
        : [];
      if (
        assets.length !== assetIds.length ||
        input.rentals.some(
          (rental) =>
            rental.assetId &&
            !assets.some(
              (asset) =>
                asset.id === rental.assetId && asset.skuId === rental.skuId,
            ),
        )
      ) {
        throw new BadRequestException(
          'Hay máquinas inexistentes o que no corresponden a la referencia seleccionada',
        );
      }
      const overlaps = await tx.annexDraft.findMany({
        where: {
          customerWorksiteId,
          periodFrom: { lte: periodTo },
          periodTo: { gte: periodFrom },
        },
        include: {
          revisions: {
            orderBy: { revision: 'desc' },
            take: 1,
            select: {
              invoiceNumber: true,
              through: true,
              input: Boolean(input.worksiteRates?.length),
            },
          },
        },
      });
      const current = overlaps.find(
        (d) =>
          d.periodFrom.getTime() === periodFrom.getTime() &&
          d.periodTo.getTime() === periodTo.getTime(),
      );
      const invoice =
        parsed.data.invoiceNumber === undefined
          ? current?.revisions?.[0]?.invoiceNumber
          : parsed.data.invoiceNumber;
      const reservedUntil = invoice
        ? new Date(input.period.through + 'T00:00:00Z')
        : periodTo;
      if (
        overlaps.some((d) => {
          if (d.id === current?.id) return false;
          const latest = d.revisions?.[0];
          const until =
            latest?.invoiceNumber && latest.through
              ? latest.through
              : d.periodTo;
          return until >= periodFrom && d.periodFrom <= reservedUntil;
        })
      )
        throw new ConflictException(
          'Ya existe un borrador con un período solapado',
        );
      if ((current?.revision ?? 0) !== expectedRevision)
        throw new ConflictException(
          'El borrador cambió. Carga la última revisión antes de guardar',
        );
      if (input.worksiteRates?.length) {
        const previous = annexInputSchema.safeParse(
          current?.revisions?.[0]?.input,
        );
        validateWorksiteRates(
          input,
          previous.success ? previous.data.worksiteRates : undefined,
        );
      }
      const revision = expectedRevision + 1;
      const draft = current
        ? await tx.annexDraft.update({
            where: { id: current.id },
            data: { revision },
          })
        : await tx.annexDraft.create({
            data: { customerWorksiteId, periodFrom, periodTo, revision },
          });
      const saved = await tx.annexDraftRevision.create({
        data: {
          draftId: draft.id,
          invoiceNumber:
            parsed.data.invoiceNumber === undefined
              ? (current?.revisions?.[0]?.invoiceNumber ?? null)
              : parsed.data.invoiceNumber,
          revision,
          through: new Date(`${input.period.through}T00:00:00Z`),
          input: input as Prisma.InputJsonValue,
          result: result as unknown as Prisma.InputJsonValue,
          reason,
          sourceIssues,
          createdBy: userId,
        },
      });
      if (input.policy.rememberMinimums) {
        const key = worksiteMinimumKey(customerWorksiteId);
        const existing = minimumSettings(
          (await tx.appSetting.findUnique({ where: { key } }))?.value,
        );
        const patch = minimumSettings(input.policy.rememberMinimums);
        const value = {
          days: { ...existing.days, ...patch.days },
          hours: { ...existing.hours, ...patch.hours },
        };
        await tx.appSetting.upsert({
          where: { key },
          create: { key, value, category: 'ANNEX_COMMERCIAL' },
          update: { value },
        });
      }
      return { ...draft, revisions: [saved] };
    });
  }
}
