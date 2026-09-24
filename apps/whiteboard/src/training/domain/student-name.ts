import { DomainError } from "./errors";

export class StudentName {
  static readonly MAX_LENGTH = 200;

  private constructor(readonly value: string) {}

  static create(raw: string): StudentName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError(
        "STUDENT_NAME_REQUIRED",
        "Student name is required.",
      );
    }
    if (value.length > StudentName.MAX_LENGTH) {
      throw new DomainError(
        "STUDENT_NAME_TOO_LONG",
        `Student name must be at most ${String(StudentName.MAX_LENGTH)} characters.`,
      );
    }
    return new StudentName(value);
  }
}
