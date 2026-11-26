/** How the HTTP layer answers: 404, 409, 403, or 400. */
export type PreschoolErrorKind =
  "not_found" | "conflict" | "forbidden" | "invalid";

/**
 * A rule of the Preschool context was broken. The error says how it should be
 * answered, so adding a code never means editing a shared list.
 */
export class PreschoolError extends Error {
  readonly kind: PreschoolErrorKind;
  readonly code: string;
  /** Sent as the error envelope's `details` (ADR-0017). */
  readonly details?: unknown;

  constructor(
    kind: PreschoolErrorKind,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "PreschoolError";
    this.kind = kind;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function notFound(code: string, message: string): PreschoolError {
  return new PreschoolError("not_found", code, message);
}

export function conflict(
  code: string,
  message: string,
  details?: unknown,
): PreschoolError {
  return new PreschoolError("conflict", code, message, details);
}

export function forbidden(code: string, message: string): PreschoolError {
  return new PreschoolError("forbidden", code, message);
}

export function invalid(
  code: string,
  message: string,
  details?: unknown,
): PreschoolError {
  return new PreschoolError("invalid", code, message, details);
}
