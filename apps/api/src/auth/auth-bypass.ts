const enabled = (value?: string) => value?.trim().toLowerCase() === 'true';

export function isAuthBypassEnabled() {
  const deploymentEnvironment = (
    process.env.RAILWAY_ENVIRONMENT_NAME
    ?? process.env.APP_ENVIRONMENT
    ?? ''
  ).trim().toLowerCase();

  if (deploymentEnvironment === 'production') return false;

  const localBypass =
    process.env.NODE_ENV !== 'production'
    && enabled(process.env.AUTH_BYPASS_LOCAL);
  const deployedBypass =
    Boolean(deploymentEnvironment)
    && enabled(process.env.AUTH_BYPASS_ENABLED);

  return localBypass || deployedBypass;
}
