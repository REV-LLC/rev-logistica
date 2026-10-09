import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  profileSchema,
  scopeSchema,
  type CommercialScope,
} from './commercial-profile.input';
import { effectiveCommercialProfile } from './commercial-history';
@Injectable()
export class CommercialProfilesService {
  constructor(private readonly prisma: PrismaService) {}
  async get(type: unknown, id: unknown) {
    const parsed = scopeSchema.safeParse({ scopeType: type, scopeId: id });
    if (!parsed.success)
      throw new BadRequestException('Ámbito comercial inválido');
    const scope = parsed.data;
    await this.validateIds(this.prisma, scope, []);
    const profile = await this.prisma.commercialProfile.findUnique({
      where: { scopeType_scopeId: scope },
      include: { revisions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    const own = profile?.revisions[0];
    let inherited: unknown;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (scope.scopeType === 'ASSET') {
      const asset = await this.prisma.asset.findUniqueOrThrow({
        where: { id: scope.scopeId },
        include: { sku: true },
      });
      inherited = await effectiveCommercialProfile(
        this.prisma,
        { skuId: asset.skuId, familyId: asset.sku.assetFamilyId, isImplement: asset.isImplement },
        today,
      );
    } else if (scope.scopeType === 'SKU') {
      const sku = await this.prisma.sku.findUniqueOrThrow({
        where: { id: scope.scopeId },
        include: { assets: { where: { isImplement: true }, select: { id: true }, take: 1 } },
      });
      inherited = await effectiveCommercialProfile(
        this.prisma,
        { familyId: sku.assetFamilyId, isImplement: sku.isImplement || sku.assets.length > 0 },
        today,
      );
    }
    return {
      id: profile?.id ?? null,
      ...scope,
      version: profile?.version ?? 0,
      effectiveFrom: own?.effectiveFrom.toISOString().slice(0, 10) ?? null,
      ...(own ? (own.payload as object) : { groups: [], modes: [] }),
      ...(inherited ? { inherited } : {}),
    };
  }
  private async validateIds(
    tx: Pick<
      Prisma.TransactionClient,
      'asset' | 'sku' | 'assetFamily' | 'accessory'
    >,
    scope: CommercialScope,
    selectors: Array<{ kind: string; id: string }>,
    writable = false,
  ) {
    const ids = [{ kind: scope.scopeType, id: scope.scopeId }, ...selectors];
    for (const kind of ['ASSET', 'SKU', 'FAMILY', 'ACCESSORY']) {
      const selected = [
        ...new Set(ids.filter((s) => s.kind === kind).map((s) => s.id)),
      ];
      if (!selected.length) continue;
      const where = { id: { in: selected } };
      const count =
        kind === 'ASSET'
          ? await tx.asset.count({ where })
          : kind === 'SKU'
            ? await tx.sku.count({ where })
            : kind === 'FAMILY'
              ? await tx.assetFamily.count({ where })
              : await tx.accessory.count({ where: { ...where,
                ...(writable ? { implementBridge: null } : {}),
              } });
      if (count !== selected.length)
        throw new NotFoundException(
          writable ? 'La configuración referencia un elemento inexistente o un implemento ya convertido a equipo. Usa su nueva ficha de inventario.'
            : 'La configuración referencia un equipo, familia, referencia o accesorio inexistente',
        );
    }
  }
  async save(value: unknown, userId: string) {
    const parsed = profileSchema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    const input = parsed.data;
    const scope = { scopeType: input.scopeType, scopeId: input.scopeId };
    return this.prisma.$transaction(async (tx) => {
      // Promotion acquires the same identity locks before commercial-profile
      // locks. A concurrent edit cannot resurrect a retired legacy selector.
      const legacyIds = [...new Set([
        ...(scope.scopeType === 'ACCESSORY' ? [scope.scopeId] : []),
        ...input.groups.flatMap(group => group.selectors.filter(selector => selector.kind === 'ACCESSORY').map(selector => selector.id)),
      ])].sort();
      for (const id of legacyIds)
        await tx.$queryRaw`SELECT id FROM "Accessory" WHERE id = ${id} FOR SHARE`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial-profile:${scope.scopeType}:${scope.scopeId}`},0))::text`;
      await this.validateIds(
        tx,
        scope,
        input.groups.flatMap((g) => g.selectors),
        true,
      );
      let profile = await tx.commercialProfile.findUnique({
        where: { scopeType_scopeId: scope },
      });
      if ((profile?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException(
          'Las modalidades cambiaron. Recarga antes de guardar',
        );
      profile = profile
        ? await tx.commercialProfile.update({
            where: { id: profile.id },
            data: { version: { increment: 1 } },
          })
        : await tx.commercialProfile.create({ data: { ...scope, version: 1 } });
      const payload = { groups: input.groups, modes: input.modes };
      await tx.commercialProfileRevision.create({
        data: {
          profileId: profile.id,
          version: profile.version,
          effectiveFrom: new Date(input.effectiveFrom + 'T00:00:00Z'),
          payload: payload as Prisma.InputJsonValue,
          createdBy: userId,
        },
      });
      return {
        id: profile.id,
        ...scope,
        version: profile.version,
        effectiveFrom: input.effectiveFrom,
        ...payload,
      };
    });
  }
}
