import { DomainError } from "./errors";

export class TodoTitle {
  static readonly MAX_LENGTH = 200;

  private constructor(readonly value: string) {}

  static create(raw: string): TodoTitle {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError("TODO_TITLE_REQUIRED", "Title is required.");
    }
    if (value.length > TodoTitle.MAX_LENGTH) {
      throw new DomainError(
        "TODO_TITLE_TOO_LONG",
        `Title must be at most ${TodoTitle.MAX_LENGTH} characters.`,
      );
    }
    return new TodoTitle(value);
  }
}
