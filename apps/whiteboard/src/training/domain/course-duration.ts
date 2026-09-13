import { DomainError } from "./errors";

export class CourseDuration {
  static readonly MAX_LENGTH = 80;

  private constructor(readonly value: string) {}

  static create(raw: string): CourseDuration {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError(
        "COURSE_DURATION_REQUIRED",
        "Course duration is required.",
      );
    }
    if (value.length > CourseDuration.MAX_LENGTH) {
      throw new DomainError(
        "COURSE_DURATION_TOO_LONG",
        `Course duration must be at most ${String(CourseDuration.MAX_LENGTH)} characters.`,
      );
    }
    return new CourseDuration(value);
  }
}
