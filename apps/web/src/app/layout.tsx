import '@mantine/core/styles.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Rev Logistica Backoffice',
  description: 'Backoffice UI for inventory operations.',
  applicationName: 'REV Logística',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'REV Logística',
  },
  icons: {
    icon: '/fiesta.svg',
    shortcut: '/fiesta.svg',
    apple: '/pwa-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1c7ed6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
