import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { activeLegacyEquipmentOrigins, inspectLegacyEquipmentOrigin, legacyEffectiveDate } from './legacy-equipment-origin';

@Injectable()
export class LegacyEquipmentOriginsService {
  constructor(private readonly db: PrismaService) {}
  async inspect(sourceLedgerId: string, effectiveFrom: string) {
    const { source, ...inspection } = await inspectLegacyEquipmentOrigin(this.db, sourceLedgerId, effectiveFrom);
    return inspection;
  }
  active(siteId: string) { return activeLegacyEquipmentOrigins(this.db, siteId); }
  review(input: { sourceLedgerId: string; effectiveFrom: string; fingerprint: string; note: string }, userId: string) {
    if (input.note.trim().length < 10) throw new BadRequestException('Describe la evidencia revisada para este equipo.');
    return this.db.$transaction(async tx => {
      const original = await tx.stockLedger.findUnique({ where: { id: input.sourceLedgerId }, select: { assetId: true } });
      if (!original?.assetId) throw new BadRequestException('El movimiento no identifica un equipo individual.');
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${original.assetId} FOR UPDATE`;
      const checked = await inspectLegacyEquipmentOrigin(tx, input.sourceLedgerId, input.effectiveFrom);
      if (checked.fingerprint !== input.fingerprint) throw new ConflictException('Cambió la evidencia o la configuración comercial desde la revisión. Vuelve a inspeccionar este registro.');
      const existing = await tx.legacyEquipmentOrigin.findUnique({ where: { sourceLedgerId: input.sourceLedgerId } });
      if (existing) {
        if ((existing.evidenceSnapshot as { fingerprint?: string }).fingerprint !== input.fingerprint)
          throw new ConflictException('Este origen ya tiene un empalme revisado. No se reemplaza su historial.');
        return existing;
      }
      return tx.legacyEquipmentOrigin.create({ data: {
        sourceLedgerId: input.sourceLedgerId, effectiveFrom: legacyEffectiveDate(input.effectiveFrom),
        reviewedBy: userId, note: input.note.trim(),
        evidenceSnapshot: { ...checked.evidence, fingerprint: checked.fingerprint } as unknown as Prisma.InputJsonValue,
        commercialSnapshot: checked.commercialSnapshot as unknown as Prisma.InputJsonValue,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
  }
}
