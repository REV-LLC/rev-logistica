'use client';

import Link from 'next/link';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMessageCircle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { getCurrentUserRole } from '@/lib/auth';

export default function OfficeAssistantLauncher() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const role = getCurrentUserRole();
    setVisible(role === 'ADMIN' || role === 'OFFICE');
  }, []);

  if (!visible) return null;
  return (
    <Tooltip label="Asistente Office" position="left" withArrow>
      <ActionIcon
        component={Link}
        href="/office-assistant"
        aria-label="Abrir asistente Office"
        size={52}
        radius="xl"
        variant="filled"
        style={{
          position: 'fixed',
          right: 'max(16px, env(safe-area-inset-right))',
          bottom: 'max(16px, env(safe-area-inset-bottom))',
          zIndex: 190,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        }}
      >
        <IconMessageCircle size={28} stroke={1.8} />
      </ActionIcon>
    </Tooltip>
  );
}
