import Image from 'next/image';
import styles from './PageLoadingBoundary.module.css';
import { PAGE_LOADING_ENTER_MS, PAGE_LOADING_REVEAL_MS } from '@/lib/page-loading-transition';

/** Shared full-screen fallback for page navigation, not a second page theme. */
export default function PageLoadingOverlay({ phase = 'loading' }: { phase?: 'loading' | 'revealing' }) {
  return <div className={styles.overlay} data-page-transition="true" data-phase={phase}
    style={{ animationDuration: `${phase === 'revealing' ? PAGE_LOADING_REVEAL_MS : PAGE_LOADING_ENTER_MS}ms` }}
    role="status" aria-live="polite" aria-label="Cargando página">
    <div className={styles.message}>
      <Image className={styles.logo} src="/fiesta.svg?v=silver" alt="" width={156} height={78} priority aria-hidden="true" />
      <div className={styles.track} aria-hidden="true"><span /></div>
      <span className={styles.label}>Cargando…</span>
    </div>
  </div>;
}
