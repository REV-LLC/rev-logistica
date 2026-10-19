import AppImage from './AppImage';
import styles from './EmployeePageBackground.module.css';

export default function EmployeePageBackground({ src, mobileSrc, variant }: { src: string | null; mobileSrc?: string; variant?: 'transport' | 'brand' }) {
  return <div className={styles.backdrop} data-variant={variant} data-page-background="dark" aria-hidden="true">
    {src ? <picture className={styles.picture}>
      {mobileSrc ? <source media="(max-width: 48em)" srcSet={mobileSrc} /> : null}
      <AppImage key={src} src={src} alt="" fill unoptimized={false} priority={!mobileSrc} loading={mobileSrc ? 'eager' : undefined} fetchPriority={mobileSrc ? 'high' : undefined} sizes={variant === 'brand' ? '(max-width: 48em) 100vw, calc(100vw + 284px)' : '100vw'} className={styles.backgroundImage} />
    </picture> : null}
  </div>;
}
