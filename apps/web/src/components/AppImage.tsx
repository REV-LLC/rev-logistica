'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';
import { canOptimizeImage } from '@/lib/image-policy';
import styles from './AppImage.module.css';

/** Shared image renderer. Blob/data previews and private URLs stay in the browser. */
export default function AppImage({ src, className, unoptimized, onLoad, onError, ...props }: ImageProps) {
  const sourceKey = typeof src === 'string' ? src : 'src' in src ? src.src : src.default.src;
  const [settled, setSettled] = useState<{ key: string; failed: boolean } | null>(null);
  const pending = settled?.key !== sourceKey;
  return (
    <Image
      {...props}
      src={src}
      unoptimized={unoptimized ?? (typeof src === 'string' && !canOptimizeImage(src))}
      className={[styles.image, className].filter(Boolean).join(' ')}
      data-image-state={pending ? 'loading' : settled?.failed ? 'error' : 'loaded'}
      aria-busy={pending}
      onLoad={event => { setSettled({ key: sourceKey, failed: false }); onLoad?.(event); }}
      onError={event => { setSettled({ key: sourceKey, failed: true }); onError?.(event); }}
    />
  );
}
