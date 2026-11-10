/**
 * In-app paths whose page prefetches on the server and renders there
 * (ADR-0052). `QuerySuspense` skips its client-only gate for these; it goes
 * when every in-app path is listed.
 */
export const SERVER_RENDERED_ROUTES: readonly string[] = [
  "/app/projects",
  "/app/settings",
];

export function isServerRendered(pathname: string): boolean {
  return SERVER_RENDERED_ROUTES.includes(pathname);
}
