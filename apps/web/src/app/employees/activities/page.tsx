'use client';

import { useSearchParams } from 'next/navigation';
import EmployeeActivitiesPanel from './EmployeeActivitiesPanel';

export default function EmployeeActivitiesPage() {
  const employeeId = useSearchParams().get('employeeId');
  return <EmployeeActivitiesPanel requestedEmployeeId={employeeId} />;
}
