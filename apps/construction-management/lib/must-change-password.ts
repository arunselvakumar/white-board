import type { SignedInCompanyAuthState } from "@repo/auth/construction/server";

/** Where a User with a Temporary Password goes first (ADR CM-0030 §8). */
export const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Whether the signed-in User still has the password an admin set, and
 * must replace it before anything else (ADR CM-0030 §8).
 */
export function mustChangePassword(auth: SignedInCompanyAuthState): boolean {
  return auth.user.mustChangePassword;
}
