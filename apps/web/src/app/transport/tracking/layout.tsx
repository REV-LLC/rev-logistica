import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Seguimiento de camiones | REV Logística',
};

export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
