import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

const money = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/, 'Valor monetario inválido').nullable();
const expectedMoney = z.string().max(100).refine(value => {
  try { return new Prisma.Decimal(value).isFinite(); } catch { return false; }
}).nullable();
const inputSchema = z.object({
  price: money,
  replacementValue: money,
  expected: z.object({ price: expectedMoney, replacementValue: expectedMoney }).strict(),
  reason: z.string().trim().min(5).max(500),
}).strict();

function sameMoney(left: Prisma.Decimal | null, right: string | null) {
  return left === null || right === null ? left === right : left.equals(right);
}

@Injectable()
export class SkuPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async update(skuId: string, value: unknown, userId: string) {
    const parsed = inputSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Revisa los valores y escribe un motivo de 5 a 500 caracteres.');
    const input = parsed.data;
    return this.prisma.$transaction(async tx => {
      // The row lock covers concurrent catalog edits, not only this screen.
      await tx.$queryRaw`SELECT id FROM "Sku" WHERE id = ${skuId} FOR UPDATE`;
      const sku = await tx.sku.findUnique({ where: { id: skuId }, select: { id: true, price: true, replacementValue: true } });
      if (!sku) throw new NotFoundException('Referencia no encontrada.');
      if (!sameMoney(sku.price, input.expected.price) || !sameMoney(sku.replacementValue, input.expected.replacementValue)) {
        throw new ConflictException('Los precios cambiaron. Cierra el editor y actualiza la lista antes de guardar.');
      }
      if (sameMoney(sku.price, input.price) && sameMoney(sku.replacementValue, input.replacementValue)) {
        throw new BadRequestException('No hay cambios de precio para guardar.');
      }
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, employee: { select: { name: true, lastName: true } } } });
      if (!user) throw new NotFoundException('Usuario no encontrado.');
      const updated = await tx.sku.update({ where: { id: skuId }, data: { price: input.price, replacementValue: input.replacementValue }, select: { id: true, price: true, replacementValue: true } });
      await tx.skuPriceChange.create({ data: {
        skuId, oldPrice: sku.price, newPrice: updated.price,
        oldReplacementValue: sku.replacementValue, newReplacementValue: updated.replacementValue,
        reason: input.reason, changedByUserId: user.id, changedByEmail: user.email,
        changedByName: [user.employee?.name, user.employee?.lastName].filter(Boolean).join(' ') || user.email,
      } });
      return updated;
    });
  }

  async history(skuId: string, cursor?: string) {
    if (!await this.prisma.sku.findUnique({ where: { id: skuId }, select: { id: true } })) throw new NotFoundException('Referencia no encontrada.');
    if (cursor && !await this.prisma.skuPriceChange.findFirst({ where: { id: cursor, skuId }, select: { id: true } })) throw new BadRequestException('Página de historial inválida.');
    const rows = await this.prisma.skuPriceChange.findMany({
      where: { skuId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
  }
}
