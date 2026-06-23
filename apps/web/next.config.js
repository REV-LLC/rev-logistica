const { execSync } = require('node:child_process');

function getBogotaBuildDate() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${byType.year}.${byType.month}.${byType.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10).replaceAll('-', '.');
  }
}

function getCommitSha() {
  const envSha =
    process.env.NEXT_PUBLIC_APP_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA;

  if (envSha) {
    return envSha.slice(0, 7);
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
}

function getDeployTarget() {
  if (process.env.NEXT_PUBLIC_APP_ENV) {
    return process.env.NEXT_PUBLIC_APP_ENV;
  }

  if (process.env.VERCEL_ENV === 'production') {
    return 'production';
  }

  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV;
  }

  return process.env.NODE_ENV === 'production' ? 'production' : 'local';
}

const appVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ||
  `${getDeployTarget()} · ${getBogotaBuildDate()} · ${getCommitSha()}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  experimental: {
    typedRoutes: false
  },
  async redirects() {
    return [
      {
        source: '/billing/prefactura',
        destination: '/billing/pre-invoice',
        permanent: true,
      },
      {
        source: '/inventory/remision-devolucion',
        destination: '/inventory/dispatch-return',
        permanent: true,
      },
      {
        source: '/obras',
        destination: '/transport/worksites',
        permanent: true,
      },
      {
        source: '/obras/:worksiteId',
        destination: '/transport/worksites/:worksiteId',
        permanent: true,
      },
      {
        source: '/transport/obras',
        destination: '/transport/worksites',
        permanent: true,
      },
      {
        source: '/transport/obras/:worksiteId',
        destination: '/transport/worksites/:worksiteId',
        permanent: true,
      },
      {
        source: '/transport/solicitudes',
        destination: '/transport/requests',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
