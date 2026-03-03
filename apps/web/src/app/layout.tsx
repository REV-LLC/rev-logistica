import '@mantine/core/styles.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Rev Logistica Backoffice',
  description: 'Backoffice UI for inventory operations.',
  icons: {
    icon: '/fiesta.svg',
    shortcut: '/fiesta.svg',
    apple: '/fiesta.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
