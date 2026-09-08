type ClerkFieldError = {
  code?: string;
  message?: string;
  longMessage?: string;
};

function messageForCode(code: string | undefined): string | undefined {
  switch (code) {
    case "form_identifier_not_found":
      return "No account found with this email or username.";
    case "form_password_incorrect":
      return "Incorrect password. Please try again.";
    case "form_identifier_exists":
      return "An account with this email already exists.";
    case "form_username_exists":
      return "That username is already taken.";
    case "form_password_pwned":
      return "This password has been found in a data breach. Please choose another.";
    case "form_password_length_too_short":
      return "Password is too short.";
    case "form_code_incorrect":
    case "verification_failed":
      return "That code is incorrect. Please try again.";
    case "too_many_requests":
      return "Too many attempts. Please try again later.";
    default:
      return undefined;
  }
}

export function clerkFieldMessage(
  error: ClerkFieldError | null | undefined,
): string | undefined {
  if (error == null) {
    return undefined;
  }
  return (
    messageForCode(error.code) ??
    error.longMessage ??
    error.message ??
    undefined
  );
}

export function clerkGlobalMessage(
  errors: ClerkFieldError[] | null | undefined,
): string | undefined {
  const first = errors?.[0];
  return clerkFieldMessage(first);
}
