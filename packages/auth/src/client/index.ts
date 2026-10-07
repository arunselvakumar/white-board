import {
  emailOTPClient,
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { AUTH_BASE_PATH } from "../urls";

function createClient(origin: string) {
  return createAuthClient({
    baseURL: `${origin}${AUTH_BASE_PATH}`,
    plugins: [usernameClient(), emailOTPClient(), organizationClient()],
  });
}

export type AuthClient = ReturnType<typeof createClient>;

let client: AuthClient | null = null;

/** The Better Auth browser client, bound to this origin's `/app/api/auth`. */
export function authClient(): AuthClient {
  if (typeof window === "undefined")
    throw new Error("authClient() is only available in the browser.");
  client ??= createClient(window.location.origin);
  return client;
}

/** An auth API failure: Better Auth's code, its message, and the status. */
export type AuthError = {
  code: string;
  message: string;
  status: number;
};

export type AuthResult = { error: AuthError | null };

export function toAuthError(error: unknown): AuthError {
  if (typeof error === "object" && error != null) {
    const record = error as Record<string, unknown>;
    const status = typeof record["status"] === "number" ? record["status"] : 0;
    const code =
      typeof record["code"] === "string" && record["code"].length > 0
        ? record["code"]
        : status === 429
          ? "TOO_MANY_REQUESTS"
          : "UNKNOWN";
    const message =
      typeof record["message"] === "string" ? record["message"] : "";
    return { code, message, status };
  }
  return { code: "UNKNOWN", message: "", status: 0 };
}
