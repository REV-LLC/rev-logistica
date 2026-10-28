import { Test } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as authBypass from '../auth/auth-bypass';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceReportsController } from './balance-reports.controller';
import { BalanceReportsService } from './balance-reports.service';
import { InventoryService } from './inventory.service';

describe('Balance exports HTTP authorization and validation', () => {
  let app: INestApplication;
  const reports = {
    options: jest.fn().mockResolvedValue({ worksites: [], warehouses: [] }),
    balances: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
  beforeAll(async () => {
    jest.spyOn(authBypass, 'isAuthBypassEnabled').mockReturnValue(false);
    const module = await Test.createTestingModule({
      controllers: [BalanceReportsController],
      providers: [
        { provide: BalanceReportsService, useValue: reports },
        RolesGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: async (token: string) => {
              if (
                ![
                  'ADMIN',
                  'OFFICE',
                  'DRIVER',
                  'OPERATOR',
                  'WAREHOUSE_TABLET',
                ].includes(token)
              )
                throw new UnauthorizedException();
              return { sub: 'test-user', role: token };
            },
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async () => ({
                active: true,
                role: 'WAREHOUSE_TABLET',
                warehouse: { active: true },
              }),
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });
  beforeEach(() => jest.clearAllMocks());
  it('requires authentication and restricts both endpoints to Admin/Office', async () => {
    for (const path of ['options', 'balances']) {
      await request(app.getHttpServer())
        .get(`/inventory/reports/${path}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/inventory/reports/${path}`)
        .set('Authorization', 'Bearer invalid')
        .expect(401);
      for (const role of ['DRIVER', 'OPERATOR', 'WAREHOUSE_TABLET']) {
        await request(app.getHttpServer())
          .get(`/inventory/reports/${path}`)
          .set('Authorization', `Bearer ${role}`)
          .expect(403);
      }
      for (const role of ['ADMIN', 'OFFICE']) {
        await request(app.getHttpServer())
          .get(`/inventory/reports/${path}`)
          .set('Authorization', `Bearer ${role}`)
          .expect(200)
          .expect('Cache-Control', 'private, no-store');
      }
    }
  });
  it('rejects invalid UUIDs, report kinds, SQL-like text, extra fields, and repeated parameters', async () => {
    for (const query of [
      'customerId=nope',
      'report=invalid',
      'warehouseId=%27%20OR%201%3D1',
      'take=20',
      'report=general&report=providers',
    ]) {
      await request(app.getHttpServer())
        .get(`/inventory/reports/balances?${query}`)
        .set('Authorization', 'Bearer ADMIN')
        .expect(400);
    }
    expect(reports.balances).not.toHaveBeenCalled();
  });
  it('passes a complete validated selection to the report service', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    await request(app.getHttpServer())
      .get(
        `/inventory/reports/balances?report=worksites&customerWorksiteId=${id}`,
      )
      .set('Authorization', 'Bearer OFFICE')
      .expect(200);
    expect(reports.balances).toHaveBeenCalledWith(
      expect.objectContaining({
        report: 'worksites',
        customerWorksiteId: id,
        ownership: 'ALL',
      }),
    );
  });
});

describe('Report read clients do not use or populate live UI caches', () => {
  it('uses the supplied transaction for every query in both canonical projections', async () => {
    const root = {
      warehouse: {
        findUnique: jest.fn(() => {
          throw new Error('Unscoped read');
        }),
      },
      customerWorksite: {
        findUnique: jest.fn(() => {
          throw new Error('Unscoped read');
        }),
      },
    };
    const cache = {
      get: jest.fn(() => {
        throw new Error('Stale UI cache');
      }),
      set: jest.fn(() => {
        throw new Error('Polluting UI cache');
      }),
    };
    const tx = {
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({ id: 'own', type: 'OWN' }),
      },
      customerWorksite: {
        findUnique: jest.fn().mockResolvedValue({ id: 'site' }),
      },
      stockLedger: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const inventory = new InventoryService(root as never, cache as never);
    await expect(
      inventory.getWarehouseInventory('own', false, tx as never),
    ).resolves.toMatchObject({ bulk: [], serial: [] });
    await expect(
      inventory.getOnSiteInventory('site', tx as never),
    ).resolves.toMatchObject({ bulk: [], serial: [] });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(tx.stockLedger.groupBy).toHaveBeenCalledTimes(7);
  });
});
