import { isAuthBypassEnabled } from './auth-bypass';

describe('isAuthBypassEnabled', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows an explicitly configured staging deployment', () => {
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    process.env.AUTH_BYPASS_ENABLED = 'true';

    expect(isAuthBypassEnabled()).toBe(true);
  });

  it('never allows the deployed bypass in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    process.env.AUTH_BYPASS_ENABLED = 'true';

    expect(isAuthBypassEnabled()).toBe(false);
  });

  it('requires an explicit bypass flag in a deployed environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    delete process.env.AUTH_BYPASS_ENABLED;

    expect(isAuthBypassEnabled()).toBe(false);
  });

  it('preserves the existing local development bypass', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    process.env.AUTH_BYPASS_LOCAL = 'true';

    expect(isAuthBypassEnabled()).toBe(true);
  });
});
