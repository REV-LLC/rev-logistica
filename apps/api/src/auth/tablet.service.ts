import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { tabletPinLookup, tabletTokenHash } from './tablet-access';

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  active: true,
  warehouseId: true,
  warehouse: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TabletService {
  constructor(private readonly prisma: PrismaService) {}

  listAccounts() {
    return this.prisma.user.findMany({
      where: { role: Role.WAREHOUSE_TABLET },
      select: ACCOUNT_SELECT,
      orderBy: { email: 'asc' },
    });
  }

  async saveAccount(
    payload: {
      identifier: string;
      password?: string;
      warehouseId: string;
      active: boolean;
    },
    id?: string,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: payload.warehouseId, active: true, type: 'OWN' },
    });
    if (!warehouse)
      throw new BadRequestException('Selecciona una bodega propia activa.');
    if (
      id &&
      !(await this.prisma.user.findFirst({
        where: { id, role: Role.WAREHOUSE_TABLET },
      }))
    )
      throw new NotFoundException('Perfil de bodega no encontrado.');
    if (!id && !payload.password)
      throw new BadRequestException('Ingresa la contraseña del perfil.');
    const data = {
      email: payload.identifier.trim().toLowerCase(),
      warehouseId: warehouse.id,
      active: payload.active,
      ...(payload.password
        ? { passwordHash: await bcrypt.hash(payload.password, 12) }
        : {}),
    };
    try {
      const account = id
        ? await this.prisma.user.update({
            where: { id },
            data,
            select: ACCOUNT_SELECT,
          })
        : await this.prisma.user.create({
            data: {
              ...data,
              passwordHash: data.passwordHash!,
              role: Role.WAREHOUSE_TABLET,
            },
            select: ACCOUNT_SELECT,
          });
      return account;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new BadRequestException('Ese usuario de acceso ya existe.');
      throw error;
    }
  }

  async employees() {
    const employees = await this.prisma.employee.findMany({
      select: {
        id: true,
        name: true,
        lastName: true,
        active: true,
        tabletPin: { select: { employeeId: true } },
      },
      orderBy: { name: 'asc' },
    });
    return employees.map(({ tabletPin, ...employee }) => ({
      ...employee,
      pinConfigured: Boolean(tabletPin),
    }));
  }

  async setPin(employeeId: string, pin: string | null) {
    if (
      !(await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Empleado no encontrado.');
    try {
      await this.prisma.$transaction(async (tx) => {
        if (pin) {
          const data = {
            pinHash: await bcrypt.hash(pin, 12),
            lookup: tabletPinLookup(pin),
          };
          await tx.employeeTabletPin.upsert({
            where: { employeeId },
            create: { employeeId, ...data },
            update: data,
          });
        } else {
          await tx.employeeTabletPin.deleteMany({ where: { employeeId } });
        }
        await tx.tabletDocumentAuthorization.updateMany({
          where: { employeeId },
          data: { expiresAt: new Date() },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new BadRequestException(
          'Ese PIN ya está asignado a otro empleado. Elige uno diferente.',
        );
      throw error;
    }
    return { pinConfigured: Boolean(pin) };
  }

  async verifyPin(userId: string, pin: string, documentId?: string) {
    // Persisted and row-locked: parallel attempts and API restarts cannot bypass the limit.
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { warehouse: true },
      });
      if (
        !user?.active ||
        user.role !== Role.WAREHOUSE_TABLET ||
        !user.warehouse?.active
      )
        throw new ForbiddenException(
          'El perfil no tiene una bodega activa asignada.',
        );
      const now = new Date();
      const expired = !user.pinWindowEndsAt || user.pinWindowEndsAt <= now;
      const count = expired ? 1 : user.pinAttempts + 1;
      if (count <= 5)
        await tx.user.update({
          where: { id: userId },
          data: {
            pinAttempts: count,
            pinWindowEndsAt: expired
              ? new Date(now.getTime() + 10 * 60_000)
              : user.pinWindowEndsAt,
          },
        });
      return { count, warehouseId: user.warehouse.id };
    });
    if (attempt.count > 5)
      throw new HttpException(
        'Demasiados intentos de PIN. Espera 10 minutos desde el primer intento y vuelve a intentarlo.',
        429,
      );
    const credential = await this.prisma.employeeTabletPin.findUnique({
      where: { lookup: tabletPinLookup(pin) },
      include: { employee: true },
    });
    if (
      !credential?.employee.active ||
      !(await bcrypt.compare(pin, credential.pinHash))
    )
      throw new ForbiddenException('PIN incorrecto o empleado inactivo.');
    const employee = credential.employee;
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 2 * 60 * 60_000);
    if (documentId) {
      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
      });
      if (
        !document ||
        document.createdBy !== userId ||
        document.status !== 'IN_PROGRESS' ||
        document.performedByEmployeeId !== employee.id ||
        document.warehouseId !== attempt.warehouseId ||
        !document.tabletAuthorizationId
      ) {
        throw new ForbiddenException(
          'Este borrador debe retomarlo el empleado que lo inició, desde el perfil de su bodega.',
        );
      }
      await this.prisma.tabletDocumentAuthorization.update({
        where: { id: document.tabletAuthorizationId },
        data: { tokenHash: tabletTokenHash(token), expiresAt },
      });
    } else {
      await this.prisma.tabletDocumentAuthorization.create({
        data: {
          userId,
          employeeId: employee.id,
          warehouseId: attempt.warehouseId,
          tokenHash: tabletTokenHash(token),
          expiresAt,
        },
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinAttempts: 0, pinWindowEndsAt: null },
    });
    return {
      token,
      expiresAt,
      employee: {
        id: employee.id,
        name: `${employee.name} ${employee.lastName}`.trim(),
      },
      warehouseId: attempt.warehouseId,
    };
  }
}
