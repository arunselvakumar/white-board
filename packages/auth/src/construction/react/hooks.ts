"use client";

import { useCallback } from "react";

import { navigateInApp, useAuthAction } from "../../react/hooks";
import { constructionAuthClient } from "../client";
import type { CompanyRole } from "../roles";
import type { CompanyAuthUser, CompanySummary } from "../types";
import { useCompanyAuthSnapshot } from "./provider";

/** Session state. Always loaded: it comes from the server. */
export function useCompanyAuth(): {
  isSignedIn: boolean;
  userId: string | null;
  workspaceId: string | null;
  role: CompanyRole | null;
  /** Change password comes first (ADR CM-0029 §8). */
  mustChangePassword: boolean;
} {
  const snapshot = useCompanyAuthSnapshot();
  return {
    isSignedIn: snapshot.userId != null,
    userId: snapshot.userId,
    workspaceId: snapshot.workspaceId,
    role: snapshot.role,
    mustChangePassword: snapshot.user?.mustChangePassword === true,
  };
}

export function useCompanyUser(): { user: CompanyAuthUser | null } {
  const { user } = useCompanyAuthSnapshot();
  return { user };
}

/** The Active Company, or null before one is chosen. */
export function useActiveCompany(): { company: CompanySummary | null } {
  const { workspaceId, companies } = useCompanyAuthSnapshot();
  return {
    company: companies.find((company) => company.id === workspaceId) ?? null,
  };
}

/** The User's Companies, and a way to make one active. */
export function useCompanyList() {
  const { companies } = useCompanyAuthSnapshot();
  const { run, fetchStatus, error } = useAuthAction();

  /** Activates a Company, then reloads at `redirectTo` (an in-app path). */
  const setActive = useCallback(
    async (workspaceId: string, redirectTo: string) => {
      const result = await run(() =>
        constructionAuthClient().organization.setActive({
          organizationId: workspaceId,
        }),
      );
      if (result.error == null) navigateInApp(redirectTo);
      return result;
    },
    [run],
  );

  return { companies, setActive, fetchStatus, error };
}

/**
 * Mobile OTP sign-in and sign-up (ADR CM-0002): send a code, then verify it.
 * Verifying an unknown number creates the User and signs them in.
 */
export function useCompanyMobileOtp() {
  const { run, fetchStatus, error, clearError } = useAuthAction();

  const sendCode = useCallback(
    (mobile: string) =>
      run(() =>
        constructionAuthClient().phoneNumber.sendOtp({ phoneNumber: mobile }),
      ),
    [run],
  );

  const verifyCode = useCallback(
    (input: { mobile: string; code: string }) =>
      run(() =>
        constructionAuthClient().phoneNumber.verify({
          phoneNumber: input.mobile,
          code: input.code.trim(),
        }),
      ),
    [run],
  );

  /** Names a User who signed up by mobile (their name starts as the number). */
  const setName = useCallback(
    (name: string) =>
      run(() => constructionAuthClient().updateUser({ name: name.trim() })),
    [run],
  );

  return { sendCode, verifyCode, setName, fetchStatus, error, clearError };
}

/** Email and password sign-in: the sign-in while SMS is off (ADR CM-0009). */
export function useCompanyEmailSignIn() {
  const { run, fetchStatus, error, clearError } = useAuthAction();
  const signIn = useCallback(
    (input: { email: string; password: string }) =>
      run(() =>
        constructionAuthClient().signIn.email({
          email: input.email.trim(),
          password: input.password,
        }),
      ),
    [run],
  );
  return { signIn, fetchStatus, error, clearError };
}

/**
 * Mobile and password sign-in (ADR CM-0029 §7), whatever the SMS switch.
 * Only a verified mobile works; errors are Better Auth's
 * (`INVALID_PHONE_NUMBER_OR_PASSWORD`).
 */
export function useCompanyMobilePasswordSignIn() {
  const { run, fetchStatus, error, clearError } = useAuthAction();
  const signIn = useCallback(
    (input: { mobile: string; password: string }) =>
      run(() =>
        constructionAuthClient().signIn.phoneNumber({
          phoneNumber: input.mobile,
          password: input.password,
        }),
      ),
    [run],
  );
  return { signIn, fetchStatus, error, clearError };
}

/**
 * Change password (ADR CM-0029 §8): the current one, then a different new
 * one (400 `PASSWORD_UNCHANGED` otherwise). Other sessions end; on success
 * `mustChangePassword` is cleared, so reload to refresh the snapshot.
 */
export function useCompanyChangePassword() {
  const { run, fetchStatus, error, clearError } = useAuthAction();
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

/** Email sign-up: details, then the emailed 6-digit code. */
export function useCompanyEmailSignUp() {
  const { run, fetchStatus, error, clearError } = useAuthAction();

  const create = useCallback(
    (input: { name: string; email: string; password: string }) =>
      run(() =>
        constructionAuthClient().signUp.email({
          email: input.email.trim(),
          password: input.password,
          name: input.name.trim(),
        }),
      ),
    [run],
  );

  const sendEmailCode = useCallback(
    (email: string) =>
      run(() =>
        constructionAuthClient().emailOtp.sendVerificationOtp({
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
        constructionAuthClient().emailOtp.verifyEmail({
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

/**
 * Forgot password: email a 6-digit code, then set a new password with it.
 * An unknown email still "sends" (nothing is emailed), so the screen never
 * reveals whether an email has an account. A reset signs out every Session.
 */
export function useCompanyPasswordReset() {
  const { run, fetchStatus, error, clearError } = useAuthAction();

  const requestCode = useCallback(
    (email: string) =>
      run(() =>
        constructionAuthClient().emailOtp.requestPasswordReset({
          email: email.trim(),
        }),
      ),
    [run],
  );

  const resetPassword = useCallback(
    (input: { email: string; code: string; password: string }) =>
      run(() =>
        constructionAuthClient().emailOtp.resetPassword({
          email: input.email.trim(),
          otp: input.code.trim(),
          password: input.password,
        }),
      ),
    [run],
  );

  return { requestCode, resetPassword, fetchStatus, error, clearError };
}

export function useCompanySignOut() {
  const { run, fetchStatus } = useAuthAction();

  /** Signs out, then reloads at `redirectTo` (Sign in by default). */
  const signOut = useCallback(
    async (redirectTo = "/sign-in") => {
      await run(() => constructionAuthClient().signOut());
      navigateInApp(redirectTo);
    },
    [run],
  );

  return { signOut, fetchStatus };
}
