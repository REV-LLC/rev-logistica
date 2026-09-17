import Image, { type ImageProps } from 'next/image';
import { canOptimizeImage } from '@/lib/image-policy';
import styles from './AppImage.module.css';

/** Shared image renderer. Blob/data previews and private URLs stay in the browser. */
export default function AppImage({ src, className, unoptimized, ...props }: ImageProps) {
  return (
    <Image
      {...props}
      src={src}
      unoptimized={unoptimized ?? (typeof src === 'string' && !canOptimizeImage(src))}
      className={[styles.image, className].filter(Boolean).join(' ')}
    />
  );
}
