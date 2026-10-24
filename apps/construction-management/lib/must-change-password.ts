import type { SignedInCompanyAuthState } from "@repo/auth/construction/server";

/** Where a User with a Temporary Password goes first (ADR CM-0029 §8). */
export const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Whether the signed-in User still has the password an admin set, and
 * must replace it before anything else (ADR CM-0029 §8). `@repo/auth`
 * puts `mustChangePassword` on the auth state; read narrowly here, the one
 * place pages ask.
 */
export function mustChangePassword(auth: SignedInCompanyAuthState): boolean {
  const state = auth as SignedInCompanyAuthState & {
    mustChangePassword?: boolean;
    user: { mustChangePassword?: boolean };
  };
  return (
    state.mustChangePassword === true || state.user.mustChangePassword === true
  );
}
