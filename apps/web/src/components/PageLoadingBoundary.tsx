'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Stack, Text } from '@mantine/core';
import Image from 'next/image';
import styles from './PageLoadingBoundary.module.css';

export default function PageLoadingBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const routeKey = `${pathname}?${search}`;
  const content = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setNavigating(false);
    const root = content.current;
    if (!root) return;
    let waitForImages = true;
    let imageDeadlineReached = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const inspect = () => {
      const dataPending = Boolean(root.querySelector('[data-page-loading="true"]'));
      const visibleImagePending = Array.from(root.querySelectorAll('[data-image-state="loading"], [data-page-image-loading="true"]')).some(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      });
      if (dataPending) {
        waitForImages = true;
        imageDeadlineReached = false;
        clearTimeout(deadline);
        deadline = undefined;
      }
      const imagesPending = waitForImages && !imageDeadlineReached && visibleImagePending;
      if (!dataPending && imagesPending && !deadline) {
        deadline = setTimeout(() => { imageDeadlineReached = true; inspect(); }, 12000);
      }
      setLoading(dataPending || imagesPending);
      if (!dataPending && !imagesPending) {
        waitForImages = false;
        clearTimeout(deadline);
        deadline = undefined;
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-page-loading', 'data-image-state', 'data-page-image-loading'] });
    inspect();
    window.addEventListener('resize', inspect);
    return () => { observer.disconnect(); clearTimeout(deadline); window.removeEventListener('resize', inspect); };
  }, [routeKey]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download || (anchor.target && anchor.target !== '_self')) return;
      const destination = new URL(anchor.href);
      if (destination.origin !== location.origin || (destination.pathname === location.pathname && destination.search === location.search)) return;
      setNavigating(true);
      clearTimeout(timeout);
      // A canceled or failed navigation must never lock the current page.
      timeout = setTimeout(() => setNavigating(false), 15000);
    };
    document.addEventListener('click', onClick, true);
    return () => { document.removeEventListener('click', onClick, true); clearTimeout(timeout); };
  }, [routeKey]);

  const busy = loading || navigating;
  return <div className={styles.boundary} aria-busy={busy}>
    <div ref={content} inert={busy}>{children}</div>
    {busy ? <div className={styles.overlay} role="status" aria-live="polite" aria-label="Cargando página">
      <Stack align="center" gap="sm" className={styles.message}>
        <div className={styles.logo} aria-hidden="true">
          <Image src="/rev-logo-clean.svg" alt="" width={80} height={80} priority />
        </div>
        <Text fw={700} size="lg">Cargando página</Text>
        <Text size="sm" c="dimmed">Preparando la información y las imágenes…</Text>
      </Stack>
    </div> : null}
  </div>;
}
