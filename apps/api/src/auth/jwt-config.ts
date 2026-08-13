const LOCAL_JWT_SECRET = 'local-development-only';

type JwtEnvironment = {
  JWT_SECRET?: string;
  NODE_ENV?: string;
};

export function resolveJwtSecret(environment: JwtEnvironment = process.env) {
  const configuredSecret = environment.JWT_SECRET?.trim();
  if (configuredSecret) return configuredSecret;

  if (environment.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }

  return LOCAL_JWT_SECRET;
}
