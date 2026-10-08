"use client";

import { useCallback, useState } from "react";

import {
  authClient,
  toAuthError,
  type AuthError,
  type AuthResult,
} from "../client";
import type { WorkspaceRole } from "../roles";
import type { AuthUser, WorkspaceSummary } from "../types";
import { useAuthSnapshot } from "./auth-provider";

export type FetchStatus = "idle" | "fetching";

/**
 * Full-page navigation to an in-app path. Used after anything that changes
 * the Session or the Active Workspace, so every server component, the
 * AuthProvider snapshot, and the query cache start fresh.
 */
export function navigateInApp(path: string): void {
  const target = path.startsWith("/") ? path : `/${path}`;
  window.location.assign(target);
}

type BetterFetchResult = { error: unknown } | { error: null };

/** Runs auth calls one at a time, tracking `fetchStatus` and the last error. Shared with the construction hooks. */
export function useAuthAction() {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<AuthError | null>(null);

  const run = useCallback(
    async (call: () => Promise<BetterFetchResult>): Promise<AuthResult> => {
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

  return {
    run,
    fetchStatus,
    error,
    clearError: () => {
      setError(null);
    },
  };
}

/** Clerk-`useAuth()`-style Session state. Always loaded: it comes from the server. */
export function useAuth(): {
  isLoaded: true;
  isSignedIn: boolean;
  userId: string | null;
  workspaceId: string | null;
  role: WorkspaceRole | null;
} {
  const snapshot = useAuthSnapshot();
  return {
    isLoaded: true,
    isSignedIn: snapshot.userId != null,
    userId: snapshot.userId,
    workspaceId: snapshot.workspaceId,
    role: snapshot.role,
  };
}

export function useUser(): { isSignedIn: boolean; user: AuthUser | null } {
  const { user } = useAuthSnapshot();
  return { isSignedIn: user != null, user };
}

/** The Active Workspace, or null before one is chosen. */
export function useWorkspace(): { workspace: WorkspaceSummary | null } {
  const { workspaceId, workspaces } = useAuthSnapshot();
  return {
    workspace:
      workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
  };
}

/** The User's Workspaces, and a way to make one active. */
export function useWorkspaceList() {
  const { workspaces } = useAuthSnapshot();
  const { run, fetchStatus, error } = useAuthAction();

  /** Activates a Workspace, then reloads at `redirectTo` (an in-app path). */
  const setActive = useCallback(
    async (workspaceId: string, redirectTo: string): Promise<AuthResult> => {
      const result = await run(() =>
        authClient().organization.setActive({ organizationId: workspaceId }),
      );
      if (result.error == null) navigateInApp(redirectTo);
      return result;
    },
    [run],
  );

  return { isLoaded: true as const, workspaces, setActive, fetchStatus, error };
}

/** Sign-in Flow: password (username or email) or Google. */
export function useSignIn() {
  const { run, fetchStatus, error, clearError } = useAuthAction();

  const password = useCallback(
    (input: { identifier: string; password: string }) => {
      const identifier = input.identifier.trim();
      return run(() =>
        identifier.includes("@")
          ? authClient().signIn.email({
              email: identifier,
              password: input.password,
            })
          : authClient().signIn.username({
              username: identifier,
              password: input.password,
            }),
      );
    },
    [run],
  );

  /** Leaves for Google; comes back to `callbackPath` (an in-app path). */
  const google = useCallback(
    (callbackPath: string) =>
      run(() =>
        authClient().signIn.social({
          provider: "google",
          callbackURL: callbackPath,
          errorCallbackURL: "/login",
        }),
      ),
    [run],
  );

  return { password, google, fetchStatus, error, clearError };
}

/** Sign-up Flow: details, then the emailed 6-digit code. */
export function useSignUp() {
  const { run, fetchStatus, error, clearError } = useAuthAction();

  const create = useCallback(
    (input: { username: string; email: string; password: string }) =>
      run(() =>
        authClient().signUp.email({
          email: input.email.trim(),
          password: input.password,
          name: input.username.trim(),
          username: input.username.trim(),
        }),
      ),
    [run],
  );

  const sendEmailCode = useCallback(
    (email: string) =>
      run(() =>
        authClient().emailOtp.sendVerificationOtp({
          email: email.trim(),
          type: "email-verification",
        }),
      ),
    [run],
  );

  /** Verifies the email and signs the User in. */
  const verifyEmailCode = useCallback(
    (input: { email: string; code: string }) =>
      run(() =>
        authClient().emailOtp.verifyEmail({
          email: input.email.trim(),
          otp: input.code.trim(),
        }),
      ),
    [run],
  );

  return {
    create,
    sendEmailCode,
    verifyEmailCode,
    fetchStatus,
    error,
    clearError,
  };
}

/** Password Reset Flow by emailed code. Every Session is signed out. */
export function usePasswordReset() {
  const { run, fetchStatus, error, clearError } = useAuthAction();

  const sendCode = useCallback(
    (email: string) =>
      run(() =>
        authClient().emailOtp.requestPasswordReset({ email: email.trim() }),
      ),
    [run],
  );

  const reset = useCallback(
    (input: { email: string; code: string; password: string }) =>
      run(() =>
        authClient().emailOtp.resetPassword({
          email: input.email.trim(),
          otp: input.code.trim(),
          password: input.password,
        }),
      ),
    [run],
  );

  return { sendCode, reset, fetchStatus, error, clearError };
}

/** Accepts a Workspace invitation as the signed-in User. */
export function useAcceptInvitation() {
  const { run, fetchStatus, error } = useAuthAction();

  const accept = useCallback(
    (invitationId: string) =>
      run(() => authClient().organization.acceptInvitation({ invitationId })),
    [run],
  );

  return { accept, fetchStatus, error };
}

export function useSignOut() {
  const { run, fetchStatus } = useAuthAction();

  /** Signs out, then reloads at `redirectTo` (an in-app path; Sign-in by default). */
  const signOut = useCallback(
    async (redirectTo = "/login") => {
      await run(() => authClient().signOut());
      navigateInApp(redirectTo);
    },
    [run],
  );

  return { signOut, fetchStatus };
}
