'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function EmployeesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
