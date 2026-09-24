import { DomainError } from "./errors";

export class CourseDescription {
  static readonly MAX_LENGTH = 4000;

  private constructor(readonly value: string) {}

  static create(raw: string | null | undefined): CourseDescription | null {
    if (raw == null) {
      return null;
    }
    const value = raw.trim();
    if (value.length === 0) {
      return null;
    }
    if (value.length > CourseDescription.MAX_LENGTH) {
      throw new DomainError(
        "COURSE_DESCRIPTION_TOO_LONG",
        `Course description must be at most ${String(CourseDescription.MAX_LENGTH)} characters.`,
      );
    }
    return new CourseDescription(value);
  }
}
