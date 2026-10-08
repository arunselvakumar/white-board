import type { BetterAuthPlugin } from "better-auth";

import { AUTH_BASE_PATH } from "./urls";

/**
 * The auth API paths Whiteboard uses (ADR-0034). Every other Better Auth
 * endpoint answers 404 over HTTP, including ones a future upgrade adds.
 * Server code may still call any endpoint through `auth.api`.
 */
export const ALLOWED_AUTH_PATHS: readonly string[] = [
  "/ok",
  "/error",
  "/get-session",
  "/sign-out",
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/username",
  "/sign-in/social",
  "/email-otp/send-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/organization/list",
  "/organization/set-active",
  "/organization/get-active-member",
  "/organization/get-invitation",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
];

/** OAuth providers redirect back to `/callback/<provider>`. */
const ALLOWED_AUTH_PREFIXES: readonly string[] = ["/callback/"];

export function isAllowedAuthPath(
  pathname: string,
  allowed: readonly string[] = ALLOWED_AUTH_PATHS,
): boolean {
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return false;
  const path = pathname.slice(AUTH_BASE_PATH.length);
  return (
    allowed.includes(path) ||
    ALLOWED_AUTH_PREFIXES.some(
      (prefix) => path.startsWith(prefix) && path.length > prefix.length,
    )
  );
}

export function allowedPaths(
  id = "whiteboard-allowed-paths",
  allowed: readonly string[] = ALLOWED_AUTH_PATHS,
): BetterAuthPlugin {
  return {
    id,
    onRequest(request) {
      if (isAllowedAuthPath(new URL(request.url).pathname, allowed))
        return Promise.resolve(undefined);
      return Promise.resolve({
        response: new Response("Not Found", { status: 404 }),
      });
    },
  };
}
