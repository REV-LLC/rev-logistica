'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function TransportLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard
      routeRoleRules={[
        { prefix: '/transport/requests', roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
        { prefix: '/transport/cost', roles: ['ADMIN', 'OFFICE'] },
        { prefix: '/transport/vehicles', roles: ['ADMIN', 'OFFICE'] },
        { prefix: '/transport/worksites', roles: ['ADMIN', 'OFFICE'] },
      ]}
    >
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
