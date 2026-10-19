type NavigationClick = {
  href: string;
  target?: string;
  download?: boolean;
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** Only same-tab internal page changes need a full-screen transition. */
export function isPageNavigation(click: NavigationClick, currentHref: string) {
  if (click.defaultPrevented || click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (click.download || (click.target && click.target.toLowerCase() !== '_self')) return false;
  const current = new URL(currentHref);
  const destination = new URL(click.href, current);
  return destination.origin === current.origin &&
    (destination.pathname !== current.pathname || destination.search !== current.search);
}
