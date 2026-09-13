export class InvalidCursorError extends Error {
  readonly code = "INVALID_CURSOR";

  constructor() {
    super("Cursor is invalid.");
    this.name = "InvalidCursorError";
  }
}
