import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveJwtSecret } from './jwt-config';

export const tabletTokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
// A keyed lookup supports unique PINs without storing a searchable plain PIN or plain digest.
export const tabletPinLookup = (pin: string) =>
  createHmac('sha256', resolveJwtSecret())
    .update(`warehouse-pin:${pin}`)
    .digest('hex');

export async function resolveTabletDocumentAccess(
  prisma: PrismaService,
  userId: string,
  token?: string,
  documentId?: string,
) {
  if (!token)
    throw new ForbiddenException(
      'Ingresa tu PIN para identificar al empleado que realiza este documento.',
    );
  const grant = await prisma.tabletDocumentAuthorization.findUnique({
    where: { tokenHash: tabletTokenHash(token) },
    include: {
      user: { include: { warehouse: true } },
      employee: { include: { tabletPin: { select: { employeeId: true } } } },
      document: { select: { id: true } },
    },
  });
  if (
    !grant ||
    grant.userId !== userId ||
    grant.expiresAt <= new Date() ||
    !grant.employee.active ||
    !grant.employee.tabletPin ||
    !grant.user.active ||
    grant.user.role !== Role.WAREHOUSE_TABLET ||
    !grant.user.warehouse?.active ||
    grant.user.warehouseId !== grant.warehouseId
  ) {
    throw new ForbiddenException(
      'La identificación del empleado venció o ya no es válida. Ingresa nuevamente tu PIN.',
    );
  }
  if (
    documentId ? grant.document?.id !== documentId : Boolean(grant.document)
  ) {
    throw new ForbiddenException(
      'La identificación del empleado solo es válida para su documento.',
    );
  }
  return {
    warehouseId: grant.warehouseId,
    performedByEmployeeId: grant.employeeId,
    performedByEmployeeName:
      `${grant.employee.name} ${grant.employee.lastName}`.trim(),
    tabletAuthorizationId: grant.id,
  };
}

export function assertTabletWarehouse(expected: string, supplied?: string) {
  if (supplied && supplied !== expected)
    throw new BadRequestException(
      'Debes utilizar la bodega asignada a este perfil.',
    );
}
