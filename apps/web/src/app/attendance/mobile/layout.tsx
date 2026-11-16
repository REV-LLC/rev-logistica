import type { Metadata, Viewport } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Mi asistencia | REV Logística',
  description: 'Marca tu entrada y salida con REV.',
  applicationName: 'REV Asistencia',
  manifest: '/attendance/mobile/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Mi asistencia', statusBarStyle: 'default' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#031426',
};

export default function MobileAttendanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
