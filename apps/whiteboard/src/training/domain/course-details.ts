import { DomainError } from "./errors";

export type CourseDetailsValue = {
  code: string | null;
  category: string | null;
  totalLearningHours: number | null;
  eligibility: string | null;
  learningOutcomes: string[];
  syllabusOutline: string[];
};

export class CourseDetails {
  private constructor(readonly value: CourseDetailsValue) {}

  static create(raw: Partial<CourseDetailsValue>): CourseDetails {
    const code = nullableTrim(raw.code)?.toUpperCase() ?? null;
    const category = nullableTrim(raw.category);
    const eligibility = nullableTrim(raw.eligibility);
    const totalLearningHours = raw.totalLearningHours ?? null;
    const learningOutcomes = normalizeLines(
      raw.learningOutcomes ?? [],
      20,
      500,
    );
    const syllabusOutline = normalizeLines(raw.syllabusOutline ?? [], 50, 200);
    if (code != null && !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(code)) {
      throw new DomainError(
        "COURSE_CODE_INVALID",
        "Course code must use letters, numbers, hyphens, or underscores (up to 40 characters).",
      );
    }
    if (category != null && category.length > 100) {
      throw new DomainError(
        "COURSE_CATEGORY_TOO_LONG",
        "Course category must be at most 100 characters.",
      );
    }
    if (eligibility != null && eligibility.length > 1000) {
      throw new DomainError(
        "COURSE_ELIGIBILITY_TOO_LONG",
        "Course eligibility must be at most 1000 characters.",
      );
    }
    if (
      totalLearningHours != null &&
      (!Number.isSafeInteger(totalLearningHours) ||
        totalLearningHours < 1 ||
        totalLearningHours > 100000)
    ) {
      throw new DomainError(
        "COURSE_LEARNING_HOURS_INVALID",
        "Total learning hours must be a positive whole number.",
      );
    }
    return new CourseDetails({
      code,
      category,
      totalLearningHours,
      eligibility,
      learningOutcomes,
      syllabusOutline,
    });
  }
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeLines(
  lines: string[],
  limit: number,
  maxLength: number,
): string[] {
  if (
    lines.length > limit ||
    lines.some(
      (line) =>
        typeof line !== "string" ||
        line.trim().length === 0 ||
        line.trim().length > maxLength,
    )
  ) {
    throw new DomainError(
      "COURSE_LIST_INVALID",
      "Course list has too many or invalid entries.",
    );
  }
  return lines.map((line) => line.trim());
}
