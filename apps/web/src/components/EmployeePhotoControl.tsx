'use client';

import { useState } from 'react';
import { ActionIcon, Box, FileButton, Tooltip } from '@mantine/core';
import { IconCamera, IconZoomIn } from '@tabler/icons-react';
import EmployeeAvatar from '@/components/EmployeeAvatar';
import { api, ApiError } from '@/lib/api';

type EmployeePhotoRecord = {
  id: string;
  name: string;
  lastName?: string | null;
};

function employeeName(employee: EmployeePhotoRecord) {
  return `${employee.name} ${employee.lastName ?? ''}`.trim();
}

export default function EmployeePhotoControl({
  employee,
  size = 48,
  editable = false,
  onPreview,
}: {
  employee: EmployeePhotoRecord;
  size?: number;
  editable?: boolean;
  onPreview?: (employee: EmployeePhotoRecord) => void;
}) {
  const [version, setVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPhoto = async (file: File | null) => {
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('photo', file);

    try {
      await api(`/employees/${employee.id}/photo`, {
        method: 'POST',
        body: formData,
      });
      setVersion((current) => current + 1);
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiError
          ? `${uploadError.status}: ${uploadError.message}`
          : 'No se pudo subir la foto',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Tooltip label={error ?? (onPreview ? 'Ampliar foto' : 'Foto del empleado')} color={error ? 'red' : undefined}>
      <Box pos="relative" w={size} h={size} style={{ flexShrink: 0 }}>
        <Box
          component={onPreview ? 'button' : 'div'}
          type={onPreview ? 'button' : undefined}
          aria-label={onPreview ? `Ampliar foto de ${employeeName(employee)}` : undefined}
          onClick={onPreview ? () => onPreview(employee) : undefined}
          style={{
            appearance: 'none',
            background: 'transparent',
            border: 0,
            cursor: onPreview ? 'zoom-in' : 'default',
            display: 'block',
            padding: 0,
          }}
        >
          <EmployeeAvatar employee={employee} size={size} version={version} />
        </Box>

        {editable ? (
          <FileButton onChange={uploadPhoto} accept="image/png,image/jpeg,image/webp">
            {(props) => (
              <ActionIcon
                {...props}
                aria-label={`Subir foto de ${employeeName(employee)}`}
                color="blue"
                loading={uploading}
                radius="xl"
                size="sm"
                variant="filled"
                style={{ position: 'absolute', bottom: -2, right: -2 }}
              >
                <IconCamera size={14} />
              </ActionIcon>
            )}
          </FileButton>
        ) : onPreview ? (
          <ActionIcon
            aria-hidden="true"
            color="dark"
            radius="xl"
            size="xs"
            variant="filled"
            style={{ position: 'absolute', bottom: -1, right: -1, pointerEvents: 'none' }}
          >
            <IconZoomIn size={12} />
          </ActionIcon>
        ) : null}
      </Box>
    </Tooltip>
  );
}
