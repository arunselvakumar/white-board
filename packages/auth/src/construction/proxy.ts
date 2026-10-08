import { getSessionCookie } from "better-auth/cookies";

import { CONSTRUCTION_COOKIE_PREFIX } from "./constants";

/**
 * Whether a request carries a Construction Management session cookie,
 * without touching the database. Optimistic: layouts and every API route
 * validate the Session for real.
 */
export function hasCompanySessionCookie(headers: Headers): boolean {
  return (
    getSessionCookie(headers, { cookiePrefix: CONSTRUCTION_COOKIE_PREFIX }) !=
    null
  );
}
