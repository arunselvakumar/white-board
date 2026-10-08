/** Whiteboard used to be served under `/app` (ADR-0035). */
const LEGACY_APP_PREFIX = "/app";

const DEFAULT_REDIRECT = "/";

const BLOCKED_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/sso-callback",
  "/create-workspace",
  "/select-workspace",
] as const;

export function safeRedirectPath(value: string | undefined): string {
  if (value == null || value.length === 0) {
    return DEFAULT_REDIRECT;
  }

  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    if (value.includes("://")) {
      return DEFAULT_REDIRECT;
    }
    return withoutLegacyAppPrefix(value);
  }

  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.length > 0 ? withoutLegacyAppPrefix(path) : DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
}

function withoutLegacyAppPrefix(path: string): string {
  if (path === LEGACY_APP_PREFIX) return DEFAULT_REDIRECT;
  if (!path.startsWith(LEGACY_APP_PREFIX)) return path;

  const suffix = path.slice(LEGACY_APP_PREFIX.length);
  if (suffix.startsWith("/")) return suffix;
  if (suffix.startsWith("?") || suffix.startsWith("#")) return `/${suffix}`;
  return path;
}

export function postWorkspacePath(value: string | undefined): string {
  const path = safeRedirectPath(value);
  const pathname = path.split("?")[0] ?? path;
  if (
    BLOCKED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return DEFAULT_REDIRECT;
  }
  return path;
}
