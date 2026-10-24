import { prisma } from "@repo/construction-db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";

/** The User chose their own password: pages and the API open again. */
export async function clearMustChangePassword(userId: string): Promise<void> {
  await prisma.identityUser.updateMany({
    where: { id: userId, mustChangePassword: true },
    data: { mustChangePassword: false, updatedAt: new Date() },
  });
}

function userIdOf(returned: unknown): string | null {
  if (returned == null || typeof returned !== "object") return null;
  const user = (returned as { user?: unknown }).user;
  if (user == null || typeof user !== "object") return null;
  const id = (user as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/**
 * The first sign-in after an admin set the password (ADR CM-0030 §8):
 * `/change-password` must choose a different one, and clears
 * `mustChangePassword` once it succeeds.
 */
export function firstPassword(): BetterAuthPlugin {
  return {
    id: "construction-first-password",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/change-password",
          handler: createAuthMiddleware((ctx) => {
            const body = ctx.body as
              { currentPassword?: unknown; newPassword?: unknown } | undefined;
            if (
              typeof body?.newPassword === "string" &&
              body.newPassword === body.currentPassword
            )
              throw new APIError("BAD_REQUEST", {
                code: "PASSWORD_UNCHANGED",
                message: "Choose a password different from the current one.",
              });
            return Promise.resolve();
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path === "/change-password",
          handler: createAuthMiddleware(async (ctx) => {
            const returned: unknown = ctx.context.returned;
            if (isAPIError(returned)) return;
            const userId = userIdOf(returned);
            if (userId != null) await clearMustChangePassword(userId);
          }),
        },
      ],
    },
  };
}
