import type { AuthError } from "@repo/auth/react";

/** Which form field an auth error belongs to; `global` shows above the button. */
export type AuthErrorField =
  "identifier" | "username" | "email" | "password" | "code" | "global";

type Mapping = { field: AuthErrorField; message: string };

const BY_CODE: Record<string, Mapping> = {
  INVALID_EMAIL_OR_PASSWORD: {
    field: "global",
    message: "Incorrect email, username, or password.",
  },
  INVALID_USERNAME_OR_PASSWORD: {
    field: "global",
    message: "Incorrect email, username, or password.",
  },
  EMAIL_NOT_VERIFIED: {
    field: "global",
    message: "Verify your email before signing in.",
  },
  USER_ALREADY_EXISTS: {
    field: "email",
    message: "An account with this email already exists.",
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    field: "email",
    message: "An account with this email already exists.",
  },
  INVALID_EMAIL: { field: "email", message: "Enter a valid email address." },
  USERNAME_IS_ALREADY_TAKEN: {
    field: "username",
    message: "That username is already taken.",
  },
  USERNAME_TOO_SHORT: {
    field: "username",
    message: "Username must be at least 3 characters.",
  },
  USERNAME_TOO_LONG: {
    field: "username",
    message: "Username must be at most 30 characters.",
  },
  INVALID_USERNAME: {
    field: "username",
    message: "Use letters, numbers, underscores, and dots only.",
  },
  PASSWORD_TOO_SHORT: { field: "password", message: "Password is too short." },
  PASSWORD_TOO_LONG: { field: "password", message: "Password is too long." },
  INVALID_OTP: {
    field: "code",
    message: "That code is incorrect. Please try again.",
  },
  OTP_EXPIRED: {
    field: "code",
    message: "That code has expired. Request a new one.",
  },
  TOO_MANY_ATTEMPTS: {
    field: "code",
    message: "Too many attempts. Request a new code.",
  },
  TOO_MANY_REQUESTS: {
    field: "global",
    message: "Too many attempts. Please try again later.",
  },
  INVITATION_NOT_FOUND: {
    field: "global",
    message:
      "This invitation is no longer valid. Ask the Owner to send a new one.",
  },
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: {
    field: "global",
    message: "This invitation was sent to a different email address.",
  },
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: {
    field: "global",
    message: "Verify your email before accepting the invitation.",
  },
};

const FALLBACK: Mapping = {
  field: "global",
  message: "Something went wrong. Please try again.",
};

export function authErrorMapping(error: AuthError): Mapping {
  return (
    BY_CODE[error.code] ??
    (error.status === 429 ? BY_CODE["TOO_MANY_REQUESTS"] : undefined) ??
    FALLBACK
  );
}

/** The message for one field, or for `global`, or undefined. */
export function authErrorMessage(
  error: AuthError | null | undefined,
  field: AuthErrorField,
): string | undefined {
  if (error == null) return undefined;
  const mapping = authErrorMapping(error);
  return mapping.field === field ? mapping.message : undefined;
}
