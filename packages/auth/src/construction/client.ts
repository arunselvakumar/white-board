import {
  emailOTPClient,
  organizationClient,
  phoneNumberClient,
} from "better-auth/client/plugins";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { createAuthClient } from "better-auth/react";

import { AUTH_BASE_PATH } from "../urls";
import type { impersonation } from "./impersonation";

/** Types `client.impersonation.*` from the server plugin (ADR CM-0029). */
const impersonationClient = () =>
  ({
    id: "construction-impersonation",
    $InferServerPlugin: {} as ReturnType<typeof impersonation>,
  }) satisfies BetterAuthClientPlugin;

function createClient(origin: string) {
  return createAuthClient({
    baseURL: `${origin}${AUTH_BASE_PATH}`,
    plugins: [
      phoneNumberClient(),
      emailOTPClient(),
      organizationClient(),
      impersonationClient(),
    ],
  });
}

export type ConstructionAuthClient = ReturnType<typeof createClient>;

let client: ConstructionAuthClient | null = null;

/** The Better Auth browser client for Construction Management. */
export function constructionAuthClient(): ConstructionAuthClient {
  if (typeof window === "undefined")
    throw new Error(
      "constructionAuthClient() is only available in the browser.",
    );
  client ??= createClient(window.location.origin);
  return client;
}
