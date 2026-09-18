// Public inventory storage. Override for deployments using another bucket/CDN.
const imageBases = (process.env.NEXT_PUBLIC_IMAGE_BASE_URLS
  || process.env.R2_PUBLIC_BASE_URL
  || 'https://pub-fd09f01a50dd4b08ae93a3feaca1c0d6.r2.dev')
  .split(',').map((base) => new URL(base.trim()));
for (const base of imageBases) {
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('Image base URLs must be public HTTPS URLs without credentials, queries or fragments');
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  env: {
    NEXT_PUBLIC_IMAGE_BASE_URLS: imageBases.map((base) => base.href).join(','),
  },
  images: {
    formats: ['image/webp'],
    qualities: [75],
    minimumCacheTTL: 14400,
    remotePatterns: imageBases.map((base) => ({
      protocol: 'https',
      hostname: base.hostname,
      port: base.port,
      pathname: `${base.pathname.replace(/\/+$/, '')}/**`,
      search: '',
    })),
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
