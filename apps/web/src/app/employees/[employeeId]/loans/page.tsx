'use client';

import { useParams } from 'next/navigation';
import EmployeeLoansPanel from './EmployeeLoansPanel';

export default function EmployeeLoanPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <EmployeeLoansPanel key={employeeId} employeeId={employeeId} />;
}
