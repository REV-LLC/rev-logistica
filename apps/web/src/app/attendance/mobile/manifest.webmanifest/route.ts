import type { MetadataRoute } from 'next';

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: '/attendance/mobile',
    name: 'MiREV',
    short_name: 'MiREV',
    description: 'Entrada y salida de empleados de REV.',
    start_url: '/attendance/mobile',
    scope: '/attendance/mobile',
    display: 'standalone',
    background_color: '#202326',
    theme_color: '#202326',
    lang: 'es-CO',
    icons: [
      { src: '/mirev-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/mirev-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/mirev-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return Response.json(manifest, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } });
}
