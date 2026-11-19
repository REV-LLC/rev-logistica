import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const providerSelect = { id: true, kind: true, name: true, active: true } as const;
const employeeSelect = { id: true, name: true, lastName: true, eps: true, arl: true, epsId: true, arlId: true } as const;
export function affiliationName(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Escribe el nombre de la entidad.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 160) throw new BadRequestException('El nombre debe tener entre 1 y 160 caracteres.');
  return { name, normalizedName: name.toLowerCase() };
}
@Injectable()
export class EmployeeAffiliationsService {
  constructor(private readonly prisma: PrismaService) {}
  private async staff(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { active: true, role: true } });
    if (!user?.active || (user.role !== Role.ADMIN && user.role !== Role.OFFICE)) throw new ForbiddenException('Solo oficina puede configurar las afiliaciones.');
  }
  async employees(userId: string) {
    await this.staff(userId);
    return this.prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: employeeSelect });
  }
  async catalog(userId: string) {
    await this.staff(userId);
    return this.prisma.employeeAffiliationProvider.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }], select: providerSelect });
  }
  private duplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Esta entidad ya existe en el catálogo. Búscala para asignarla.');
    throw error;
  }
  async create(userId: string, body: { kind?: unknown; name?: unknown }) {
    await this.staff(userId);
    if (body.kind !== 'EPS' && body.kind !== 'ARL') throw new BadRequestException('Selecciona EPS o ARL.');
    const names = affiliationName(body.name);
    try { return await this.prisma.employeeAffiliationProvider.create({ data: { kind: body.kind, ...names }, select: providerSelect }); }
    catch (error) { return this.duplicate(error); }
  }
  async update(userId: string, id: string, body: { name?: unknown; active?: unknown }) {
    await this.staff(userId);
    const names = affiliationName(body.name);
    if (typeof body.active !== 'boolean') throw new BadRequestException('Revisa el estado de la entidad.');
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "EmployeeAffiliationProvider" WHERE "id" = ${id} FOR UPDATE`;
        const provider = await tx.employeeAffiliationProvider.findUnique({ where: { id }, select: providerSelect });
        if (!provider) throw new NotFoundException('Entidad no encontrada.');
        const updated = await tx.employeeAffiliationProvider.update({ where: { id }, data: { ...names, active: body.active as boolean }, select: providerSelect });
        // Compatibility mirrors for deployed clients. IDs are the source of truth.
        await tx.employee.updateMany({ where: provider.kind === 'EPS' ? { epsId: id } : { arlId: id }, data: provider.kind === 'EPS' ? { eps: names.name } : { arl: names.name } });
        return updated;
      });
    } catch (error) { return this.duplicate(error); }
  }
  async assign(userId: string, employeeId: string, body: { epsId?: unknown; arlId?: unknown }) {
    await this.staff(userId);
    const id = (value: unknown) => {
      if (value === null) return null;
      if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException('Selecciona las entidades del catálogo. Actualiza MiREV si ves campos de texto.');
      return value;
    };
    const epsId = id(body.epsId), arlId = id(body.arlId);
    return this.prisma.$transaction(async tx => {
      // Providers first, in a stable order, to match rename/disable lock ordering.
      for (const providerId of [...new Set([epsId, arlId].filter((value): value is string => Boolean(value)))].sort()) {
        await tx.$queryRaw`SELECT "id" FROM "EmployeeAffiliationProvider" WHERE "id" = ${providerId} FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { active: true, epsId: true, arlId: true } });
      if (!employee?.active) throw new NotFoundException('Empleado activo no encontrado.');
      const provider = async (providerId: string | null, kind: string, previous: string | null) => {
        if (!providerId) return null;
        const item = await tx.employeeAffiliationProvider.findUnique({ where: { id: providerId }, select: providerSelect });
        if (!item || item.kind !== kind || (!item.active && previous !== providerId)) throw new BadRequestException(`Selecciona una ${kind} activa del catálogo.`);
        return item;
      };
      const eps = await provider(epsId, 'EPS', employee.epsId), arl = await provider(arlId, 'ARL', employee.arlId);
      return tx.employee.update({ where: { id: employeeId }, data: { epsId, arlId, eps: eps?.name || null, arl: arl?.name || null }, select: employeeSelect });
    });
  }
}
