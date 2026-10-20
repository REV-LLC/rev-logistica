'use client';

import { useParams } from 'next/navigation';
import EmployeeProfile from '@/components/EmployeeProfile';

export default function EmployeeProfilePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <EmployeeProfile key={employeeId} employeeId={employeeId} />;
}
