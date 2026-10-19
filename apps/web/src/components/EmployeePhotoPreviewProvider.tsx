'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import EmployeePhotoModal from './EmployeePhotoModal';

type EmployeePhotoRecord = { id: string; name: string; lastName?: string | null };
const PreviewContext = createContext<((employee: EmployeePhotoRecord) => void) | null>(null);

export function useEmployeePhotoPreview() {
  const openPhoto = useContext(PreviewContext);
  if (!openPhoto) throw new Error('Employee photos require EmployeePhotoPreviewProvider.');
  return openPhoto;
}

export default function EmployeePhotoPreviewProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<EmployeePhotoRecord | null>(null);
  return <PreviewContext.Provider value={setEmployee}>
    {children}
    <EmployeePhotoModal employee={employee} onClose={() => setEmployee(null)} />
  </PreviewContext.Provider>;
}
