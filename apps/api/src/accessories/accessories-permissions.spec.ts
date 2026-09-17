import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AccessoriesController } from './accessories.controller';

jest.mock('../auth/auth-bypass', () => ({ isAuthBypassEnabled: () => false }));

describe('Accessory endpoint permissions with authentication enabled', () => {
  const jwt = new JwtService({ secret: 'accessory-tests-only' });
  const auth = new JwtAuthGuard(jwt, {} as any);
  const roles = new RolesGuard(new Reflector());
  const methods = [
    'list',
    'get',
    'history',
    'equipment',
    'equipmentById',
    'create',
    'update',
    'move',
  ] as const;
  function context(
    method: (typeof methods)[number] | 'documentOptions',
    token?: string,
  ) {
    const request = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => AccessoriesController,
      getHandler: () => AccessoriesController.prototype[method],
    } as ExecutionContext;
  }
  it.each(['ADMIN', 'OFFICE'])(
    'permits %s to manage accessory cards',
    async (role) => {
      const token = await jwt.signAsync({ sub: 'test-user', role });
      for (const method of methods) {
        const ctx = context(method, token);
        expect(await auth.canActivate(ctx)).toBe(true);
        expect(roles.canActivate(ctx)).toBe(true);
      }
    },
  );
  it.each(['DRIVER', 'OPERATOR'])(
    'does not permit %s to mutate or list the accessory module',
    async (role) => {
      const token = await jwt.signAsync({ sub: 'test-user', role });
      for (const method of methods) {
        const ctx = context(method, token);
        await auth.canActivate(ctx);
        expect(() => roles.canActivate(ctx)).toThrow('Insufficient role');
      }
    },
  );
  it('rejects anonymous, invalid and expired credentials', async () => {
    await expect(auth.canActivate(context('create'))).rejects.toThrow(
      'Missing Authorization',
    );
    await expect(
      auth.canActivate(context('update', 'invalid')),
    ).rejects.toThrow('La sesión ya no es válida. Inicia sesión nuevamente.');
    const expired = await jwt.signAsync(
      { sub: 'test-user', role: 'ADMIN' },
      { expiresIn: -1 },
    );
    await expect(auth.canActivate(context('move', expired))).rejects.toThrow(
      'La sesión ya no es válida. Inicia sesión nuevamente.',
    );
  });
  it('allows Driver to read documentary options without granting card management', async () => {
    const ctx = context(
      'documentOptions',
      await jwt.signAsync({ sub: 'driver', role: 'DRIVER' }),
    );
    expect(await auth.canActivate(ctx)).toBe(true);
    expect(roles.canActivate(ctx)).toBe(true);
    const operator = context(
      'documentOptions',
      await jwt.signAsync({ sub: 'operator', role: 'OPERATOR' }),
    );
    await auth.canActivate(operator);
    expect(() => roles.canActivate(operator)).toThrow('Insufficient role');
  });
});
