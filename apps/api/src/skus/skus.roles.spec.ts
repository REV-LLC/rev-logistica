import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { SkusController } from './skus.controller';

describe('SKU catalog permissions for document item selection', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (method: keyof SkusController, role?: Role) =>
    ({
      getHandler: () => SkusController.prototype[method],
      getClass: () => SkusController,
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  it.each([Role.ADMIN, Role.OFFICE, Role.WAREHOUSE_TABLET, Role.DRIVER])(
    'allows %s to load equipment references for provider deliveries',
    (role) => {
      expect(guard.canActivate(context('listSkus', role))).toBe(true);
    },
  );

  it.each([Role.OPERATOR, undefined])('rejects catalog access for %s', (role) => {
    expect(() => guard.canActivate(context('listSkus', role))).toThrow(ForbiddenException);
  });

  it.each([
    'createSku', 'updateSku', 'deleteSku', 'getSku', 'listUnits',
    'listProviderPrices', 'upsertProviderPrice', 'deleteProviderPrice',
  ] as const)('keeps %s restricted to Office and Admin', (method) => {
    expect(() => guard.canActivate(context(method, Role.DRIVER))).toThrow(ForbiddenException);
    expect(guard.canActivate(context(method, Role.OFFICE))).toBe(true);
    expect(guard.canActivate(context(method, Role.ADMIN))).toBe(true);
  });
});
