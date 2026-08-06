/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
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
