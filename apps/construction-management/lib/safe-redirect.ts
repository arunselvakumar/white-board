import type { HrefSuffix } from "./page-href";

/** Where a signed-in User lands when nothing else was asked for. */
export const APP_HOME = "/app/projects";

/** An invite link (`/join/<token>`), which a User may need to sign in for. */
export function isJoinPath(value: string): boolean {
  return /^\/join\/[\w-]{16,64}$/.test(value);
}

/**
 * A redirect target from a query string, kept only when it is an in-app
 * path inside `/app` or an invite link. Anything else (another host, the
 * auth pages) falls back to the Projects home.
 */
export function safeAppPath(value: string | null | undefined): string {
  if (value == null || value.length === 0) return APP_HOME;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  )
    return APP_HOME;
  if (isJoinPath(value)) return value;
  if (
    value !== "/app" &&
    !value.startsWith("/app/") &&
    !value.startsWith("/app?")
  )
    return APP_HOME;
  return value;
}

/**
 * `/continue` with the redirect target carried along. The target sits in the
 * query string, so the result is always `/continue`, a route handler rather
 * than a page, which Next's typed routes still check.
 */
export function continuePath(
  redirectUrl: string | null | undefined,
): `/continue${HrefSuffix}` {
  const target = safeAppPath(redirectUrl);
  return target === APP_HOME
    ? "/continue"
    : `/continue?redirect_url=${encodeURIComponent(target)}`;
}
