"use client";

import type {
  AuthError,
  AuthResult,
  FetchStatus,
} from "@repo/auth/construction/react";
import { constructionAuthClient } from "@repo/auth/construction/client";
import { useCallback, useState } from "react";

/*
 * Mobile + password sign-in and Change password (ADR CM-0029 §7, §8), on
 * the Better Auth client. They keep the `@repo/auth/construction/react`
 * hooks' shape: every action resolves `{ error }`, and `fetchStatus` and
 * the last `error` drive the form.
 */

function toAuthError(failure: unknown): AuthError {
  if (typeof failure === "object" && failure != null) {
    const record = failure as Record<string, unknown>;
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

function useAction() {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<AuthError | null>(null);
  const run = useCallback(
    async (call: () => Promise<{ error: unknown }>): Promise<AuthResult> => {
      setFetchStatus("fetching");
      setError(null);
      try {
        const result = await call();
        const failure = result.error == null ? null : toAuthError(result.error);
        setError(failure);
        return { error: failure };
      } catch (thrown) {
        const failure = toAuthError(thrown);
        setError(failure);
        return { error: failure };
      } finally {
        setFetchStatus("idle");
      }
    },
    [],
  );
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  return { run, fetchStatus, error, clearError };
}

/** Sign in with a verified mobile (E.164) and password, SMS on or off. */
export function useMobilePasswordSignIn() {
  const { run, fetchStatus, error, clearError } = useAction();
  const signIn = useCallback(
    (input: { phoneNumber: string; password: string }) =>
      run(() =>
        constructionAuthClient().signIn.phoneNumber({
          phoneNumber: input.phoneNumber,
          password: input.password,
        }),
      ),
    [run],
  );
  return { signIn, fetchStatus, error, clearError };
}

/** Replaces the password; other devices are signed out. */
export function useChangePassword() {
  const { run, fetchStatus, error, clearError } = useAction();
  const changePassword = useCallback(
    (input: { currentPassword: string; newPassword: string }) =>
      run(() =>
        constructionAuthClient().changePassword({
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        }),
      ),
    [run],
  );
  return { changePassword, fetchStatus, error, clearError };
}
