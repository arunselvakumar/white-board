/**
 * Why a command or query cannot proceed, in words a screen can show. `kind`
 * is domain meaning, not HTTP: the route maps `not_found` to 404,
 * `conflict` to 409, `forbidden` to 403, `limit` to 402 and `invalid` to 400
 * (root ADR-0017).
 */
export type DomainErrorKind =
  "invalid" | "not_found" | "conflict" | "forbidden" | "limit";

export class DomainError extends Error {
  readonly code: string;
  readonly kind: DomainErrorKind;
  /** Sent as the error envelope's `details`. */
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options: { kind?: DomainErrorKind; details?: unknown } = {},
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.kind = options.kind ?? "invalid";
    if (options.details !== undefined) this.details = options.details;
  }
}

export function notFound(code: string, message: string): DomainError {
  return new DomainError(code, message, { kind: "not_found" });
}

export function conflict(
  code: string,
  message: string,
  details?: unknown,
): DomainError {
  return new DomainError(code, message, { kind: "conflict", details });
}

export function forbidden(code: string, message: string): DomainError {
  return new DomainError(code, message, { kind: "forbidden" });
}
