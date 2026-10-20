'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useSearchParams } from 'next/navigation';
import PageLoadingOverlay from './PageLoadingOverlay';
import { isPageNavigation } from '@/lib/page-navigation';
import { loadingRevealDelay, PAGE_LOADING_ENTER_MS, PAGE_LOADING_REVEAL_MS } from '@/lib/page-loading-transition';
import { PageNavigationContext } from './PageNavigationContext';
import styles from './PageLoadingBoundary.module.css';

export default function PageLoadingBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const routeKey = `${pathname}?${search}`;
  const content = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'revealing' | 'idle'>('loading');
  const enteredAt = useRef(0);
  const navigationDeadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entryFrame = useRef<number | undefined>(undefined);

  const beginNavigation = useCallback(() => {
    setNavigating(true);
    clearTimeout(navigationDeadline.current);
    // A canceled or failed navigation must never lock the current page.
    navigationDeadline.current = setTimeout(() => setNavigating(false), 15000);
  }, []);

  const navigateAfterEntrance = useCallback((navigate: () => void) => {
    clearTimeout(entryTimer.current);
    if (entryFrame.current !== undefined) cancelAnimationFrame(entryFrame.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { navigate(); return; }
    // Commit the overlay on the old page before Next can commit a cached destination.
    flushSync(beginNavigation);
    entryFrame.current = requestAnimationFrame(() => {
      entryTimer.current = setTimeout(navigate, PAGE_LOADING_ENTER_MS);
    });
  }, [beginNavigation]);

  useEffect(() => () => {
    clearTimeout(navigationDeadline.current);
    clearTimeout(entryTimer.current);
    if (entryFrame.current !== undefined) cancelAnimationFrame(entryFrame.current);
  }, []);

  // Inspect the newly committed page before paint, including its client data markers.
  useLayoutEffect(() => {
    setNavigating(false);
    clearTimeout(navigationDeadline.current);
    clearTimeout(entryTimer.current);
    if (entryFrame.current !== undefined) cancelAnimationFrame(entryFrame.current);
    const root = content.current;
    if (!root) return;
    let waitForImages = true;
    let imageDeadlineReached = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const inspect = () => {
      // Next can retain previous routes hidden in the DOM; they must not hold this page open.
      const dataPending = Array.from(root.querySelectorAll('[data-page-loading="true"]'))
        .some(element => element.getClientRects().length > 0);
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
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      // Coordinated links begin only after Next confirms an uncanceled same-tab navigation.
      if (anchor.dataset.pageTransitionLink === 'true') return;
      if (isPageNavigation({ defaultPrevented: event.defaultPrevented, button: event.button,
        metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey,
        href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') }, location.href)) beginNavigation();
    };
    const onPopState = () => {
      clearTimeout(entryTimer.current);
      if (entryFrame.current !== undefined) cancelAnimationFrame(entryFrame.current);
      if (`${location.pathname}?${new URLSearchParams(location.search).toString()}` !== routeKey) beginNavigation();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('popstate', onPopState); };
  }, [routeKey, beginNavigation]);

  const busy = loading || navigating;

  // Keep the glass mounted while the destination is revealed; a new load cancels that reveal.
  useLayoutEffect(() => {
    if (busy) {
      enteredAt.current = performance.now();
      setPhase('loading');
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) { setPhase('idle'); return; }
    const timer = setTimeout(() => setPhase('revealing'), loadingRevealDelay(performance.now() - enteredAt.current));
    return () => clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    if (phase !== 'revealing') return;
    const timer = setTimeout(() => setPhase('idle'), PAGE_LOADING_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const covered = busy || phase !== 'idle';
  return <PageNavigationContext.Provider value={navigateAfterEntrance}><div className={styles.boundary}>
    <div ref={content} aria-busy={covered} inert={covered}>{children}</div>
    {covered ? <PageLoadingOverlay phase={!busy && phase === 'revealing' ? 'revealing' : 'loading'} /> : null}
  </div></PageNavigationContext.Provider>;
}
