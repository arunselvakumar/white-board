export class DomainError extends Error {
  readonly code: string;
  /** Sent as the error envelope's `details` (ADR-0017). */
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
