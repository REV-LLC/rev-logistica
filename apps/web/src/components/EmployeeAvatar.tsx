'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@mantine/core';
import { apiBlob } from '@/lib/api';

type EmployeeAvatarRecord = {
  id: string;
  name: string;
  lastName?: string | null;
};

function getEmployeeFullName(employee: Pick<EmployeeAvatarRecord, 'name' | 'lastName'>) {
  return `${employee.name} ${employee.lastName ?? ''}`.trim();
}

function getEmployeeInitials(employee: Pick<EmployeeAvatarRecord, 'name' | 'lastName'>) {
  const parts = getEmployeeFullName(employee).split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` || 'E';
}

export default function EmployeeAvatar({
  employee,
  size = 40,
  version = 0,
}: {
  employee: EmployeeAvatarRecord;
  size?: number;
  version?: number;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setPhotoUrl(null);

    apiBlob(`/employees/${employee.id}/photo?v=${version}`, { redirectOnAuthError: false })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [employee.id, version]);

  return (
    <Avatar src={photoUrl} radius="xl" size={size} color="blue" alt={getEmployeeFullName(employee)}>
      {getEmployeeInitials(employee)}
    </Avatar>
  );
}
