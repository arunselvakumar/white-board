import { DomainError } from "./errors";

export class CourseName {
  static readonly MAX_LENGTH = 200;

  private constructor(readonly value: string) {}

  static create(raw: string): CourseName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError("COURSE_NAME_REQUIRED", "Course name is required.");
    }
    if (value.length > CourseName.MAX_LENGTH) {
      throw new DomainError(
        "COURSE_NAME_TOO_LONG",
        `Course name must be at most ${String(CourseName.MAX_LENGTH)} characters.`,
      );
    }
    return new CourseName(value);
  }
}
