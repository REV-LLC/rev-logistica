'use client';

import { useEffect, useRef } from 'react';

// Scroll only when the camera opens or becomes ready, never while framing a selfie.
export function useCameraViewport(open: boolean, ready: boolean) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => region.current?.scrollIntoView({
      block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    }));
    return () => cancelAnimationFrame(frame);
  }, [open, ready]);
  return region;
}
