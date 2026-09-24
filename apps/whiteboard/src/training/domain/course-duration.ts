import { DomainError } from "./errors";

export type CourseDurationValue =
  | { kind: "fixed"; value: number; unit: "days" | "weeks" | "months" }
  | { kind: "flexible" };

export class CourseDuration {
  private constructor(readonly value: CourseDurationValue) {}

  static create(raw: CourseDurationValue): CourseDuration {
    if (raw.kind === "flexible") {
      return new CourseDuration({ kind: "flexible" });
    }
    if (
      !Number.isSafeInteger(raw.value) ||
      raw.value < 1 ||
      raw.value > 1000 ||
      !["days", "weeks", "months"].includes(raw.unit)
    ) {
      throw new DomainError(
        "COURSE_DURATION_INVALID",
        "Expected duration must be a positive whole number with days, weeks, or months.",
      );
    }
    return new CourseDuration({
      kind: "fixed",
      value: raw.value,
      unit: raw.unit,
    });
  }
}
