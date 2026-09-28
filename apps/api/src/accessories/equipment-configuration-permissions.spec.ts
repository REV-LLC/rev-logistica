import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { EquipmentConfigurationController } from './equipment-configuration.controller';
import { EquipmentMotorsController } from './equipment-motors.controller';

jest.mock('../auth/auth-bypass', () => ({ isAuthBypassEnabled: () => false }));

describe('Configuration permissions with real JWT guards', () => {
  const jwt = new JwtService({ secret: 'configuration-tests-only' });
  const auth = new JwtAuthGuard(jwt, {
    user: {
      findUnique: async () => ({
        active: true,
        role: 'WAREHOUSE_TABLET',
        warehouseId: 'qa',
        warehouse: { active: true },
      }),
    },
  } as any);
  const roles = new RolesGuard(new Reflector());
  const methods = [
    'assetCandidates',
    'motorHistory',
    'getAsset',
    'returnParts',
    'getAccessory',
    'saveAsset',
    'saveAccessory',
  ] as const;
  const context = (method: (typeof methods)[number], token?: string) => {
    const request = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => EquipmentConfigurationController,
      getHandler: () => EquipmentConfigurationController.prototype[method],
    } as unknown as ExecutionContext;
  };
  it.each(['ADMIN', 'OFFICE'])(
    'allows %s to configure inventory',
    async (role) => {
      const token = await jwt.signAsync({ sub: 'qa', role });
      for (const method of methods) {
        const ctx = context(method, token);
        expect(await auth.canActivate(ctx)).toBe(true);
        expect(roles.canActivate(ctx)).toBe(true);
      }
    },
  );
  it.each(['DRIVER', 'OPERATOR', 'WAREHOUSE_TABLET'])(
    'does not let %s change configuration',
    async (role) => {
      const token = await jwt.signAsync({ sub: 'qa', role });
      for (const method of methods) {
        const ctx = context(method, token);
        await auth.canActivate(ctx);
        if (['DRIVER', 'WAREHOUSE_TABLET'].includes(role) && ['getAsset', 'returnParts'].includes(method)) {
          expect(roles.canActivate(ctx)).toBe(true);
        } else expect(() => roles.canActivate(ctx)).toThrow('Insufficient role');
      }
    },
  );
  it('rejects unauthenticated requests', async () => {
    for (const method of methods)
      await expect(auth.canActivate(context(method))).rejects.toThrow(
        'Missing Authorization',
      );
  });
  it.each(['ADMIN', 'OFFICE', 'DRIVER', 'WAREHOUSE_TABLET', 'OPERATOR'])('protects all dedicated motor routes for %s', async role => {
    for (const method of ['list', 'equipment', 'get', 'assign', 'edit'] as const) {
      const token = await jwt.signAsync({ sub: 'qa', role });
      const ctx = context('getAsset', token);
      ctx.getClass = () => EquipmentMotorsController;
      ctx.getHandler = () => EquipmentMotorsController.prototype[method];
      await auth.canActivate(ctx);
      if (['ADMIN', 'OFFICE'].includes(role)) expect(roles.canActivate(ctx)).toBe(true);
      else expect(() => roles.canActivate(ctx)).toThrow('Insufficient role');
    }
  });
});
