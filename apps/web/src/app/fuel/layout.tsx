'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function FuelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['ADMIN', 'DRIVER', 'OPERATOR']}>
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
