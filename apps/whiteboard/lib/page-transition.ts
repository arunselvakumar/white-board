export type PageTransitionClick = {
  destination: URL;
  current: URL;
  reducedMotion: boolean;
  download: boolean;
  target: string | null;
  button: number;
  modified: boolean;
  defaultPrevented: boolean;
  canViewTransition: boolean;
};

/**
 * Router href for an in-app link click that should crossfade, or null when the
 * browser (or Next.js Link) should handle the click unchanged.
 *
 * Query-only and hash-only clicks are left alone: the transition waits on the
 * pathname, and those navigations never change it.
 */
export function pageTransitionHref(click: PageTransitionClick): string | null {
  if (
    !click.canViewTransition ||
    click.reducedMotion ||
    click.defaultPrevented ||
    click.button !== 0 ||
    click.modified ||
    click.download
  ) {
    return null;
  }

  const target = click.target;
  if (target != null && target !== "" && target !== "_self") {
    return null;
  }

  if (click.destination.origin !== click.current.origin) {
    return null;
  }

  const nextPath = click.destination.pathname;
  if (
    nextPath === "/api" ||
    nextPath.startsWith("/api/") ||
    nextPath.startsWith("/_next")
  ) {
    return null;
  }

  if (click.destination.pathname === click.current.pathname) {
    return null;
  }

  return `${nextPath}${click.destination.search}${click.destination.hash}`;
}
