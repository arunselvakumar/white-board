import { parseUuid } from "./uuid";

export class EnrollmentId {
  private constructor(readonly value: string) {}

  static create(raw: string): EnrollmentId {
    return new EnrollmentId(
      parseUuid(raw, "ENROLLMENT_ID_INVALID", "Enrollment id must be a UUID."),
    );
  }

  equals(other: EnrollmentId): boolean {
    return this.value === other.value;
  }
}
