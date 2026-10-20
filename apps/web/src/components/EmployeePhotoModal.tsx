"use client";

import AppAvatar from '@/components/AppAvatar';
import { useEmployeePhotoUrl } from '@/components/EmployeeAvatar';
import ProfilePhotoLightbox from '@/components/ProfilePhotoLightbox';
import { employeeProfileHref } from '@/lib/employee-profile';
import photoShape from './EmployeePhotoShape.module.css';

type EmployeePhotoRecord = {
  id: string;
  name: string;
  lastName?: string | null;
};

function employeeName(employee: EmployeePhotoRecord) {
  return `${employee.name} ${employee.lastName ?? ""}`.trim();
}

function EmployeePhotoPreview({ employee }: { employee: EmployeePhotoRecord }) {
  const photoUrl = useEmployeePhotoUrl(employee.id, 0, true);
  const name = employeeName(employee);
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` || 'E';

  return (
    <AppAvatar src={photoUrl} alt={`Foto ampliada de ${name}`} size="var(--profile-photo-size)" radius="50%" className={photoShape.circle} color="gray"
      imageSizes="(max-width: 432px) calc(100vw - 48px), 384px">{initials}</AppAvatar>
  );
}

export default function EmployeePhotoModal({
  employee,
  onClose,
}: {
  employee: EmployeePhotoRecord | null;
  onClose: () => void;
}) {
  return (
    <ProfilePhotoLightbox
      opened={Boolean(employee)}
      onClose={onClose}
      name={employee ? employeeName(employee) : ''}
      profileHref={employee ? employeeProfileHref(employee.id) : undefined}
    >
      {employee ? <EmployeePhotoPreview employee={employee} /> : null}
    </ProfilePhotoLightbox>
  );
}
