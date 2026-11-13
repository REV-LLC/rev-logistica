import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { WhatsappReportsController } from './whatsapp-reports.controller';
import { WhatsappReportRecordsService } from './whatsapp-report-records.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceJournalsService } from './attendance-journals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('WhatsApp report deletion permissions', () => {
  let app: INestApplication;
  const records = {
    deleteReport: jest.fn().mockResolvedValue({ deleted: true }),
    list: jest.fn().mockResolvedValue([]),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [WhatsappReportsController],
      providers: [
        { provide: WhatsappReportRecordsService, useValue: records },
        { provide: PrismaService, useValue: {} },
        {
          provide: AttendanceJournalsService,
          useValue: {
            employees: jest.fn().mockResolvedValue({ employees: [] }),
            journals: jest
              .fn()
              .mockResolvedValue({ journals: [], nextCursor: null }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (!req.headers['x-test-role']) throw new UnauthorizedException();
          req.user = { sub: 'qa-actor', role: req.headers['x-test-role'] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => records.deleteReport.mockClear());
  const path = '/whatsapp-reports/11111111-2222-4333-8444-555555555555';
  it.each(['ADMIN', 'OFFICE'])('allows %s', async (role) => {
    await request(app.getHttpServer())
      .delete(path)
      .set('x-test-role', role)
      .expect(200, { deleted: true });
    expect(records.deleteReport).toHaveBeenCalledWith(
      path.split('/').at(-1),
      'qa-actor',
    );
  });
  it.each(['DRIVER', 'OPERATOR', 'WAREHOUSE_TABLET'])(
    'denies %s',
    async (role) => {
      await request(app.getHttpServer())
        .delete(path)
        .set('x-test-role', role)
        .expect(403);
      expect(records.deleteReport).not.toHaveBeenCalled();
    },
  );
  it('rejects anonymous and invalid IDs', async () => {
    await request(app.getHttpServer()).delete(path).expect(401);
    await request(app.getHttpServer())
      .delete('/whatsapp-reports/not-an-id')
      .set('x-test-role', 'OFFICE')
      .expect(400);
    expect(records.deleteReport).not.toHaveBeenCalled();
  });
  it('supports the combined entry/exit category', async () => {
    await request(app.getHttpServer())
      .get('/whatsapp-reports?kind=ATTENDANCE')
      .set('x-test-role', 'OFFICE')
      .expect(200);
    expect(records.list).toHaveBeenCalledWith('ATTENDANCE', undefined);
  });
});
