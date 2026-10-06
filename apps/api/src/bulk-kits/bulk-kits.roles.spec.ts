import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { BulkKitsController } from './bulk-kits.controller';
import { RolesGuard } from '../auth/roles.guard';
describe('Bulk kits permissions', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (method: keyof BulkKitsController, role: Role) =>
    ({
      getHandler: () => BulkKitsController.prototype[method],
      getClass: () => BulkKitsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;
  it.each([Role.ADMIN, Role.OFFICE, Role.DRIVER])(
    'allows %s to read active templates for documents',
    (role) => {
      expect(guard.canActivate(context('list', role))).toBe(true);
    },
  );
  it.each(['settings', 'create', 'update', 'family'] as const)(
    'blocks Driver %s, allows Office and Admin',
    (method) => {
      expect(() => guard.canActivate(context(method, Role.DRIVER))).toThrow(
        ForbiddenException,
      );
      expect(guard.canActivate(context(method, Role.OFFICE))).toBe(true);
      expect(guard.canActivate(context(method, Role.ADMIN))).toBe(true);
    },
  );
});
