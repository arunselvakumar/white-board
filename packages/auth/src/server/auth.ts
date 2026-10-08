import { betterAuth } from "better-auth";
import { toNextJsHandler } from "better-auth/next-js";

import { createAuthOptions } from "../config";
import { createEmailSender } from "../email/sender";

function createAuth() {
  return betterAuth(createAuthOptions(emailSender));
}

export const emailSender = createEmailSender();

const globalForAuth = globalThis as typeof globalThis & {
  whiteboardAuth?: ReturnType<typeof createAuth>;
};

/** The Better Auth server. Reused across hot reloads in development. */
export const auth = globalForAuth.whiteboardAuth ?? createAuth();

if (process.env["NODE_ENV"] !== "production") {
  globalForAuth.whiteboardAuth = auth;
}

export type Auth = typeof auth;

/** Route handlers for `app/api/auth/[...all]/route.ts`. */
export const authRouteHandlers = toNextJsHandler(auth);
