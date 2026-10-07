import { getSessionCookie } from "better-auth/cookies";

/**
 * Whether a request carries a session cookie, without touching the database
 * (ADR-0034 §4). For `proxy.ts` only: Vercel bundles the proxy on its own,
 * without Prisma's query engine. It is an optimistic check; layouts
 * (`protect()`) and every API route validate the Session for real.
 */
export function hasSessionCookie(headers: Headers): boolean {
  return getSessionCookie(headers) != null;
}
