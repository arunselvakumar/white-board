import type { AuthError } from "@repo/auth/construction/react";

/** Which form field an auth error belongs to; `global` shows above the button. */
export type AuthErrorField =
  "mobile" | "name" | "email" | "password" | "code" | "global";

type Mapping = { field: AuthErrorField; message: string };

const BY_CODE: Record<string, Mapping> = {
  INVALID_PHONE_NUMBER: {
    field: "mobile",
    message: "Enter a valid mobile number.",
  },
  TOO_MANY_CODES: {
    field: "global",
    message: "Too many codes for this number. Try again in 15 minutes.",
  },
  INVALID_OTP: {
    field: "code",
    message: "That code is incorrect. Please try again.",
  },
  OTP_NOT_FOUND: {
    field: "code",
    message: "Ask for a new code.",
  },
  OTP_EXPIRED: {
    field: "code",
    message: "That code has expired. Ask for a new one.",
  },
  TOO_MANY_ATTEMPTS: {
    field: "code",
    message: "Too many wrong codes. Ask for a new one.",
  },
  INVALID_EMAIL_OR_PASSWORD: {
    field: "global",
    message: "Incorrect email or password.",
  },
  EMAIL_NOT_VERIFIED: {
    field: "global",
    message: "Verify your email before signing in.",
  },
  USER_ALREADY_EXISTS: {
    field: "email",
    message: "An account with this email already exists. Sign in instead.",
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    field: "email",
    message: "An account with this email already exists. Sign in instead.",
  },
  INVALID_EMAIL: { field: "email", message: "Enter a valid email address." },
  PASSWORD_TOO_SHORT: { field: "password", message: "Password is too short." },
  PASSWORD_TOO_LONG: { field: "password", message: "Password is too long." },
  TOO_MANY_REQUESTS: {
    field: "global",
    message: "Too many attempts. Please try again later.",
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
