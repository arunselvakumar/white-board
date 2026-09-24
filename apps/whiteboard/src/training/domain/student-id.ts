import { parseUuid } from "./uuid";

export class StudentId {
  private constructor(readonly value: string) {}

  static create(raw: string): StudentId {
    return new StudentId(
      parseUuid(raw, "STUDENT_ID_INVALID", "Student id must be a UUID."),
    );
  }

  equals(other: StudentId): boolean {
    return this.value === other.value;
  }
}
