/**
 * In-app paths whose page prefetches on the server and renders there
 * (ADR-0052), as Next-style routes (`/courses/[id]`). `QuerySuspense` skips
 * its client-only gate for these; it goes when every in-app path is listed.
 */
export const SERVER_RENDERED_ROUTES: readonly string[] = [
  "/app/marketing/companies",
  "/app/marketing/companies/new",
  "/app/marketing/companies/[id]",
  "/app/marketing/companies/[id]/edit",
  "/app/marketing/visits",
  "/app/marketing/visits/new",
  "/app/marketing/visits/[id]",
  "/app/marketing/visits/[id]/edit",
  "/app/marketing/visits/[id]/complete",
  "/app/projects",
  "/app/projects/[id]/activity",
  "/app/projects/[id]/resources",
  "/app/settings",
];

/** Matches a path against the list; `[id]`-style segments match any one. */
export function isServerRendered(
  pathname: string,
  routes: readonly string[] = SERVER_RENDERED_ROUTES,
): boolean {
  const path = pathname.split("/");
  return routes.some((route) => {
    const segments = route.split("/");
    return (
      segments.length === path.length &&
      segments.every(
        (segment, index) =>
          segment === path[index] ||
          (/^\[\w+\]$/.test(segment) && (path[index] ?? "") !== ""),
      )
    );
  });
}
