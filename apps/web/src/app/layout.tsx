import '@mantine/core/styles.css';
import './globals.css';
import type { Metadata } from 'next';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Rev Logistica Backoffice',
  description: 'Backoffice UI for inventory operations.'
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
