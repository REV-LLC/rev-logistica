import { Role } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('includes the linked employee phone in user options', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            email: 'operador@example.com',
            role: Role.OPERATOR,
            active: true,
            employee: {
              name: 'Ana',
              lastName: 'Ruiz',
              phone: '3001234567',
            },
          },
        ]),
      },
    };
    const service = new UsersService(prisma as never);

    await expect(service.listUsers({ active: true })).resolves.toEqual([
      {
        id: 'user-1',
        name: 'Ana Ruiz',
        email: 'operador@example.com',
        role: Role.OPERATOR,
        active: true,
        phone: '3001234567',
      },
    ]);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        employee: {
          select: { name: true, lastName: true, phone: true },
        },
      }),
    }));
  });

  it('returns a null phone when the user has no linked employee', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-2',
            email: 'admin@example.com',
            role: Role.ADMIN,
            active: true,
            employee: null,
          },
        ]),
      },
    };
    const service = new UsersService(prisma as never);

    const [user] = await service.listUsers({ active: true });

    expect(user.phone).toBeNull();
  });
});
