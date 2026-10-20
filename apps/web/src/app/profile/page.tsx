'use client';

import AuthGuard from '@/components/AuthGuard';
import ResponsiveShell from '@/components/ResponsiveShell';
import EmployeeProfile from '@/components/EmployeeProfile';

export default function MyProfilePage() {
  return <AuthGuard allowedRoles={['ADMIN', 'OFFICE', 'DRIVER', 'OPERATOR']}>
    <ResponsiveShell><EmployeeProfile selfService /></ResponsiveShell>
  </AuthGuard>;
}
