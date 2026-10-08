/** Where a signed-in User lands when nothing else was asked for. */
export const APP_HOME = "/app/projects";

/**
 * A redirect target from a query string, kept only when it is an in-app
 * path inside `/app`. Anything else (another host, the auth pages) falls back
 * to the Projects home.
 */
export function safeAppPath(value: string | null | undefined): string {
  if (value == null || value.length === 0) return APP_HOME;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  )
    return APP_HOME;
  if (
    value !== "/app" &&
    !value.startsWith("/app/") &&
    !value.startsWith("/app?")
  )
    return APP_HOME;
  return value;
}

/** `/continue` with the redirect target carried along. */
export function continuePath(redirectUrl: string | null | undefined): string {
  const target = safeAppPath(redirectUrl);
  return target === APP_HOME
    ? "/continue"
    : `/continue?redirect_url=${encodeURIComponent(target)}`;
}
