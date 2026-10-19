'use client';

import { useState } from 'react';
import { ActionIcon, Box, FileButton, Tooltip } from '@mantine/core';
import { IconCamera, IconZoomIn } from '@tabler/icons-react';
import EmployeeAvatar, {
  invalidateEmployeePhoto,
} from '@/components/EmployeeAvatar';
import { api, ApiError } from '@/lib/api';
import { useEmployeePhotoPreview } from './EmployeePhotoPreviewProvider';

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
  grayscale = false,
  fullSize = false,
  onBeforePreview,
}: {
  employee: EmployeePhotoRecord;
  size?: number;
  editable?: boolean;
  grayscale?: boolean;
  fullSize?: boolean;
  onBeforePreview?: () => void;
}) {
  const openPhoto = useEmployeePhotoPreview();
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
      invalidateEmployeePhoto(employee.id);
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
    <Tooltip
      label={error ?? 'Ampliar foto'}
      color={error ? 'red' : undefined}
    >
      <Box pos="relative" w={size} h={size} style={{ flexShrink: 0 }}>
        <Box
          component="button"
          type="button"
          aria-label={`Ampliar foto de ${employeeName(employee)}`}
          onClick={() => { onBeforePreview?.(); openPhoto(employee); }}
          style={{
            appearance: 'none',
            background: 'transparent',
            border: 0,
            borderRadius: '50%',
            cursor: 'zoom-in',
            display: 'block',
            width: size,
            height: size,
            padding: 0,
            filter: grayscale ? 'grayscale(1)' : undefined,
          }}
        >
          <EmployeeAvatar employee={employee} size={size} fullSize={fullSize} />
        </Box>

        {editable ? (
          <FileButton
            onChange={uploadPhoto}
            accept="image/png,image/jpeg,image/webp"
          >
            {(props) => (
              <ActionIcon
                {...props}
                aria-label={`Subir foto de ${employeeName(employee)}`}
                color="blue"
                loading={uploading}
                radius="xl"
                size={size >= 128 ? 44 : 'sm'}
                variant="filled"
                style={{ position: 'absolute', bottom: -2, right: -2 }}
              >
                <IconCamera size={size >= 128 ? 20 : 14} />
              </ActionIcon>
            )}
          </FileButton>
        ) : (
          <ActionIcon
            aria-hidden="true"
            color="dark"
            radius="xl"
            size="xs"
            variant="filled"
            style={{
              position: 'absolute',
              bottom: -1,
              right: -1,
              pointerEvents: 'none',
            }}
          >
            <IconZoomIn size={12} />
          </ActionIcon>
        )}
      </Box>
    </Tooltip>
  );
}
