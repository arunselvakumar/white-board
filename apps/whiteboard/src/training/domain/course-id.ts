import { parseUuid } from "./uuid";

export class CourseId {
  private constructor(readonly value: string) {}

  static create(raw: string): CourseId {
    return new CourseId(
      parseUuid(raw, "COURSE_ID_INVALID", "Course id must be a UUID."),
    );
  }

  equals(other: CourseId): boolean {
    return this.value === other.value;
  }
}
