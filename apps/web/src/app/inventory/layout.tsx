'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard
      allowedRoles={['ADMIN', 'OFFICE']}
      routeRoleRules={[
        { prefix: '/inventory/hour-meter', roles: ['ADMIN', 'OFFICE', 'OPERATOR'] },
        { prefix: '/inventory/ledger/document', roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
        { prefix: '/inventory/provider-returns', roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
      ]}
    >
      <ResponsiveShell>{children}</ResponsiveShell>
    </AuthGuard>
  );
}
