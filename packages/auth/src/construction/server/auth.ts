import { betterAuth } from "better-auth";
import { toNextJsHandler } from "better-auth/next-js";

import { createEmailSender } from "../../email/sender";
import { createConstructionAuthOptions } from "../config";
import { createSmsSender } from "../sms";

function createConstructionAuth() {
  return betterAuth(
    createConstructionAuthOptions(
      constructionEmailSender,
      constructionSmsSender,
    ),
  );
}

export const constructionEmailSender = createEmailSender();
export const constructionSmsSender = createSmsSender();

const globalForAuth = globalThis as typeof globalThis & {
  constructionAuth?: ReturnType<typeof createConstructionAuth>;
};

/** The Better Auth server for Construction Management. Reused across hot reloads. */
export const constructionAuth =
  globalForAuth.constructionAuth ?? createConstructionAuth();

if (process.env["NODE_ENV"] !== "production") {
  globalForAuth.constructionAuth = constructionAuth;
}

export type ConstructionAuth = typeof constructionAuth;

/** Route handlers for `app/api/auth/[...all]/route.ts`. */
export const constructionAuthRouteHandlers = toNextJsHandler(constructionAuth);
