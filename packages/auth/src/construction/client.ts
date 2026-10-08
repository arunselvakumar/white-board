import { emailOTPClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { AUTH_BASE_PATH } from "../urls";

function createClient(origin: string) {
  return createAuthClient({
    baseURL: `${origin}${AUTH_BASE_PATH}`,
    plugins: [emailOTPClient(), organizationClient()],
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
