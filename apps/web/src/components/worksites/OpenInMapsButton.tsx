'use client';

import { Button } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';

export function getGoogleMapsAddressUrl(address: string) {
  const params = new URLSearchParams({
    api: '1',
    query: address.trim(),
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export default function OpenInMapsButton({
  href,
  fullWidth = false,
}: {
  href: string;
  fullWidth?: boolean;
}) {
  return (
    <Button
      size="xs"
      variant="default"
      component="a"
      href={href}
      target="_blank"
      rel="noreferrer"
      leftSection={<IconExternalLink size={14} />}
      fullWidth={fullWidth}
    >
      Abrir en Maps
    </Button>
  );
}
