import { resolveJwtSecret } from './jwt-config';

describe('resolveJwtSecret', () => {
  it('uses the configured secret', () => {
    expect(
      resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: '  secure-secret  ' }),
    ).toBe('secure-secret');
  });

  it('fails closed when production has no secret', () => {
    expect(() =>
      resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: undefined }),
    ).toThrow('JWT_SECRET is required when NODE_ENV=production');
  });

  it('allows a local-only secret outside production', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'test', JWT_SECRET: undefined })).toBe(
      'local-development-only',
    );
  });
});
