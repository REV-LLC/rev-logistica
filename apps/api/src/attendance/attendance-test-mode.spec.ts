import { isAttendanceTestMode } from './attendance-test-mode';
import { AttendanceService } from './attendance.service';
describe('Attendance sandbox isolation', () => {
  const env = { ...process.env };
  beforeEach(() => Object.assign(process.env, { ATTENDANCE_TEST_MODE: 'true', RAILWAY_ENVIRONMENT_ID: '53c93c9d-33e7-4137-a598-6648a6491886', RAILWAY_ENVIRONMENT_NAME: 'staging', AUTH_BYPASS_ENABLED: 'false' }));
  afterEach(() => { process.env = { ...env }; });
  it('requires the exact staging environment and authentication', () => {
    expect(isAttendanceTestMode()).toBe(true);
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    expect(isAttendanceTestMode()).toBe(false);
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    process.env.RAILWAY_ENVIRONMENT_ID = 'different';
    expect(isAttendanceTestMode()).toBe(false);
    process.env.RAILWAY_ENVIRONMENT_ID = '53c93c9d-33e7-4137-a598-6648a6491886';
    process.env.AUTH_BYPASS_ENABLED = 'true';
    expect(isAttendanceTestMode()).toBe(false);
  });
  it('rejects enrollment before any database or photo access outside staging', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    const service = new AttendanceService(null as any, null as any, null as any, null as any);
    await expect(service.testSetup({ sub: 'x', role: 'EMPLOYEE' }, {} as any)).rejects.toThrow('Not Found');
    await expect(service.backfillDetection({ sub: 'x', role: 'EMPLOYEE' })).rejects.toThrow('Not Found');
  });
});

describe('Sandbox startup boundary', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('fails startup if the test API points at the public schema or has real integration credentials', () => {
    const { assertAttendanceTestIsolation } = require('./attendance-test-mode');
    Object.assign(process.env, { ATTENDANCE_TEST_MODE: 'true', RAILWAY_ENVIRONMENT_ID: '53c93c9d-33e7-4137-a598-6648a6491886', RAILWAY_ENVIRONMENT_NAME: 'staging', AUTH_BYPASS_ENABLED: 'false', DATABASE_URL: 'postgresql://test:test@localhost/test?schema=attendance_test', WHATSAPP_REPORTS_ENABLED: 'false', NOTIFICATION_AUTO_DISPATCH: 'false' });
    for (const key of ['R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','WHATSAPP_ACCESS_TOKEN','SMTP_PASS','ZOHO_REFRESH_TOKEN','OPENAI_API_KEY']) delete process.env[key];
    expect(() => assertAttendanceTestIsolation()).not.toThrow();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
    expect(() => assertAttendanceTestIsolation()).toThrow('isolation');
    process.env.DATABASE_URL += '?schema=attendance_test';
    process.env.R2_SECRET_ACCESS_KEY = 'forbidden-production-credential';
    expect(() => assertAttendanceTestIsolation()).toThrow('isolation');
  });
});
