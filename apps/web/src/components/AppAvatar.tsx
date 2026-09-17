'use client';

import { Avatar, type AvatarProps } from '@mantine/core';
import { useState, type CSSProperties } from 'react';
import AppImage from './AppImage';

export default function AppAvatar({ src, alt, children, imageStyle, imageSizes = '56px', ...props }:
  Omit<AvatarProps, 'imageProps'> & { imageStyle?: CSSProperties; imageSizes?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <Avatar {...props} alt={alt}>
      {src && src !== failedSrc ? (
        <AppImage
          src={src}
          alt={alt ?? props.name ?? ''}
          fill
          sizes={imageSizes}
          style={{ height: '100%', objectFit: 'cover', borderRadius: 'inherit', ...imageStyle }}
          onError={() => setFailedSrc(src)}
        />
      ) : children}
    </Avatar>
  );
}
