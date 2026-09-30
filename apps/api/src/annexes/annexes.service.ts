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
const saveSchema = z
  .object({
    customerWorksiteId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
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
      },
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
      });
      const current = overlaps.find(
        (d) =>
          d.periodFrom.getTime() === periodFrom.getTime() &&
          d.periodTo.getTime() === periodTo.getTime(),
      );
      if (overlaps.some((d) => d.id !== current?.id))
        throw new ConflictException(
          'Ya existe un borrador con un período solapado',
        );
      if ((current?.revision ?? 0) !== expectedRevision)
        throw new ConflictException(
          'El borrador cambió. Carga la última revisión antes de guardar',
        );
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
