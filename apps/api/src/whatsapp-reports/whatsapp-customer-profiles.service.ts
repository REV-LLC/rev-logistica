import { wordSimilarity } from './whatsapp-worksites';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone, normalized } from './whatsapp-report.types';
import { emptyCustomerDraft } from './whatsapp-customer-ai.service';

export type CustomerProfileInput = {
  contactName: string;
  customerId: string;
  customerWorksiteId?: string;
  requestId?: string;
  version: number;
};
function relevance(text: string, query: string) {
  const source = normalized(text),
    needle = normalized(query);
  if (!needle) return 1;
  if (source === needle) return 100;
  if (source.includes(needle)) return 80;
  const generic = new Set([
    'sas',
    'cliente',
    'empresa',
    'obra',
    'colegio',
    'universidad',
  ]);
  const terms = needle
    .split(' ')
    .filter((t) => t.length > 2 && !generic.has(t));
  if (!terms.length) return 0;
  const exact =
    (terms.filter((t) => source.includes(t)).length / terms.length) * 50;
  const target = source
    .split(' ')
    .filter((t) => t.length > 2 && !generic.has(t));
  const similarity =
    terms.reduce(
      (sum, t) =>
        sum +
        Math.max(
          0,
          ...target.map((w) => wordSimilarity(t.slice(0, 80), w.slice(0, 80))),
        ),
      0,
    ) / terms.length;
  return Math.max(exact, similarity >= 0.7 ? similarity * 35 : 0);
}
@Injectable()
export class WhatsappCustomerProfilesService {
  constructor(private readonly prisma: PrismaService) {}
  async customers(search = '') {
    const rows = await this.prisma.customer.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return rows
      .map((r) => ({ ...r, score: relevance(r.name, search) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 40)
      .map(({ score, ...r }) => r);
  }
  async worksites(customerId: string, search = '') {
    const rows = await this.prisma.customerWorksite.findMany({
      where: {
        customerId,
        active: true,
        customer: { active: true },
        worksite: { active: true },
      },
      select: {
        id: true,
        alias: true,
        worksite: { select: { name: true, address: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows
      .map((r) => ({
        id: r.id,
        name: r.alias ? `${r.worksite.name} · ${r.alias}` : r.worksite.name,
        address: r.worksite.address,
        score: relevance(`${r.worksite.name} ${r.alias ?? ''}`, search),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 60)
      .map(({ score, ...r }) => r);
  }
  async save(phone: string, input: CustomerProfileInput, actorId: string) {
    if (normalizePhone(phone) !== phone)
      throw new BadRequestException('Teléfono inválido');
    const contactName = input.contactName.trim();
    if (contactName.length < 2 || contactName.length > 80)
      throw new BadRequestException('Escribe el nombre de la persona');
    const employees = await this.prisma.employee.findMany({
      select: { phone: true },
    });
    if (employees.some((e) => normalizePhone(e.phone) === phone))
      throw new NotFoundException('Conversación no encontrada');
    return this.prisma.$transaction(async (tx) => {
      const inbound = await tx.whatsappInboundMessage.findFirst({
        where: { phone, employeeId: null },
      });
      if (!inbound) throw new NotFoundException('Conversación no encontrada');
      const customer = await tx.customer.findFirst({
        where: { id: input.customerId, active: true },
        select: { id: true, name: true },
      });
      if (!customer)
        throw new BadRequestException('Selecciona un cliente activo');
      const worksite = input.customerWorksiteId
        ? await tx.customerWorksite.findFirst({
            where: {
              id: input.customerWorksiteId,
              customerId: customer.id,
              active: true,
              worksite: { active: true },
            },
            include: { worksite: { select: { name: true } } },
          })
        : null;
      if (input.customerWorksiteId && !worksite)
        throw new BadRequestException(
          'La obra no pertenece al cliente seleccionado o ya no está activa',
        );
      if (
        input.requestId &&
        !(await tx.whatsappCustomerRequest.findFirst({
          where: { id: input.requestId, phone },
        }))
      )
        throw new NotFoundException(
          'La solicitud no pertenece a esta conversación',
        );
      await tx.whatsappCustomerChat.upsert({
        where: { phone },
        create: { phone, draft: emptyCustomerDraft(), leaseUntil: new Date(0) },
        update: {},
      });
      const updated = await tx.whatsappCustomerChat.updateMany({
        where: {
          phone,
          profileVersion: input.version,
          leaseUntil: { lte: new Date() },
        },
        data: {
          contactName,
          customerId: customer.id,
          customerWorksiteId: worksite?.id ?? null,
          profileVersion: { increment: 1 },
          profileUpdatedBy: actorId,
          profileUpdatedAt: new Date(),
        },
      });
      if (!updated.count)
        throw new ConflictException(
          'El contacto cambió o el bot está procesando un mensaje. Actualiza el chat e intenta de nuevo.',
        );
      if (input.requestId)
        await tx.whatsappCustomerRequest.update({
          where: { id: input.requestId },
          data: {
            customerId: customer.id,
            customerWorksiteId: worksite?.id ?? null,
            linkedContactName: contactName,
            linkedCustomerName: customer.name,
            linkedWorksiteName: worksite?.worksite.name ?? null,
            linkedBy: actorId,
            linkedAt: new Date(),
          },
        });
      // Billing phones, official worksite contacts, raw messages and original request
      // declarations remain untouched. This is a reviewed WhatsApp contact profile.
      return { saved: true, version: input.version + 1 };
    });
  }
}
