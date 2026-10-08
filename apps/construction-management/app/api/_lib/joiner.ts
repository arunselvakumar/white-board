import { isPlaceholderEmail } from "@repo/auth/construction/mobile";

import type { Joiner } from "@/src/organization/application/join-requests";

import type { UserSession } from "./require-session";

/** What a signed-in User has verified, for matching Join Requests (ADR CM-0002). */
export function joinerOf(session: UserSession): Joiner {
  const { user } = session;
  return {
    userId: session.userId,
    mobile: user.phoneNumber,
    email:
      user.emailVerified && !isPlaceholderEmail(user.email) ? user.email : null,
  };
}
