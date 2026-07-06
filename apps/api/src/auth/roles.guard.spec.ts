import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const createContext = (role?: Role) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(() => ({
        getRequest: jest.fn(() => ({
          user: role
            ? {
                sub: 'user-id',
                email: 'user@example.com',
                role,
              }
            : undefined,
        })),
      })),
    }) as unknown as ExecutionContext;

  const createGuard = (requiredRoles?: Role[]) => {
    const reflector = {
      getAllAndOverride: jest.fn(() => requiredRoles),
    } as unknown as Reflector;

    return new RolesGuard(reflector);
  };

  it('allows admin through routes restricted to another role', () => {
    const guard = createGuard([Role.OFFICE]);

    expect(guard.canActivate(createContext(Role.ADMIN))).toBe(true);
  });

  it('allows users with a required role', () => {
    const guard = createGuard([Role.OFFICE]);

    expect(guard.canActivate(createContext(Role.OFFICE))).toBe(true);
  });

  it('blocks non-admin users without a required role', () => {
    const guard = createGuard([Role.OFFICE]);

    expect(() => guard.canActivate(createContext(Role.DRIVER))).toThrow(ForbiddenException);
  });
});
