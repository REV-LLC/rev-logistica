'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={['ADMIN', 'OFFICE']}>
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
