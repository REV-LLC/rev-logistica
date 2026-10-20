import Image from 'next/image';
import type { CSSProperties } from 'react';
import styles from './PageLoadingBoundary.module.css';
import { PAGE_LOADING_ENTER_MS, PAGE_LOADING_REVEAL_MS } from '@/lib/page-loading-transition';

// Critical geometry is in the initial HTML: stylesheet/font loading cannot move the logo.
const overlayFrame: CSSProperties = { position: 'fixed', inset: 0, zIndex: 11000 };
const logoFrame: CSSProperties = {
  position: 'fixed', left: 'calc(50vw - 78px)', top: 'calc(50dvh - 39px)', width: 156,
};
const logoImage: CSSProperties = { display: 'block', width: 156, height: 78 };

/** Shared full-screen fallback for page navigation, not a second page theme. */
export default function PageLoadingOverlay({ phase = 'loading' }: { phase?: 'loading' | 'revealing' }) {
  return <div className={styles.overlay} data-page-transition="true" data-phase={phase}
    style={{ ...overlayFrame, animationDuration: `${phase === 'revealing' ? PAGE_LOADING_REVEAL_MS : PAGE_LOADING_ENTER_MS}ms` }}
    role="status" aria-live="polite" aria-label="Cargando página">
    <div className={styles.message} style={logoFrame}>
      <Image className={styles.logo} style={logoImage} src="/fiesta.svg?v=silver" alt="" width={156} height={78} priority aria-hidden="true" />
      <div className={styles.track} aria-hidden="true"><span /></div>
      <span className={styles.label}>Cargando…</span>
    </div>
  </div>;
}
