import * as z from "zod";

/** White Board staff sign in as a customer from this domain (ADR CM-0029). */
export const IMPERSONATION_ADMIN_DOMAIN = "white-board.io";

/** Whether `email` is a White Board staff mailbox. No subdomains. */
export function isImpersonationAdminEmail(email: string): boolean {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  return (
    at > 0 &&
    trimmed.slice(at + 1).toLowerCase() === IMPERSONATION_ADMIN_DOMAIN &&
    z.email().safeParse(trimmed).success
  );
}
