import type { MetadataRoute } from 'next';

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: '/attendance/mobile',
    name: 'REV · Mi asistencia',
    short_name: 'Mi asistencia',
    description: 'Entrada y salida de empleados de REV.',
    start_url: '/attendance/mobile',
    scope: '/attendance/mobile',
    display: 'standalone',
    background_color: '#f3f5f8',
    theme_color: '#031426',
    lang: 'es-CO',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return Response.json(manifest, { headers: { 'Content-Type': 'application/manifest+json' } });
}
