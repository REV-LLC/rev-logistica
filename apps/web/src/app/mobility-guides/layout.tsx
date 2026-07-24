'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function MobilityGuidesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['ADMIN', 'OFFICE', 'DRIVER']}>
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
