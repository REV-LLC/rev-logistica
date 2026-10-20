'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { usePageNavigation } from './PageNavigationContext';
import { isPageNavigation } from '@/lib/page-navigation';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** Preserve Next's link semantics, but paint the glass before replacing the page. */
export default function PageTransitionLink({ href, onNavigate, replace, scroll, ...props }: Props) {
  const router = useRouter();
  const navigateAfterEntrance = usePageNavigation();
  return <Link {...props} href={href} replace={replace} scroll={scroll} data-page-transition-link="true" onNavigate={event => {
    let canceled = false;
    onNavigate?.({ preventDefault: () => { canceled = true; event.preventDefault(); } });
    if (canceled || !isPageNavigation({ href, defaultPrevented: false, button: 0,
      metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }, location.href)) return;
    event.preventDefault();
    navigateAfterEntrance(() => {
      if (replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    });
  }} />;
}
