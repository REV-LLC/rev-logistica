import type { Metadata, Viewport } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'MiREV',
  description: 'Marca tu entrada y salida con REV.',
  applicationName: 'MiREV',
  manifest: '/attendance/mobile/manifest.webmanifest',
  icons: { icon: '/mirev-icon-192.png', shortcut: '/mirev-icon-192.png', apple: '/mirev-apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'MiREV', statusBarStyle: 'default' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#202326',
};

export default function MobileAttendanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
