import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'REV Logística',
    short_name: 'REV Logística',
    description: 'Operación de inventario y logística de REV.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1c7ed6',
    lang: 'es-CO',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
