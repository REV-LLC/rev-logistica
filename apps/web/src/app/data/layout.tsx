'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function DataLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
