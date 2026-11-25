import { ageInMonths, formatAge, type IsoDate } from "./dates";
import { conflict, invalid } from "./errors";

export const ADMISSION_END_REASONS = [
  "promoted",
  "withdrawn",
  "classroom_changed",
  "graduated",
] as const;
export type AdmissionEndReason = (typeof ADMISSION_END_REASONS)[number];

/** "3 y – 3 y 11 m", "from 1 y 6 m", "up to 5 y 11 m"; null when any age fits. */
export function ageRangeText(
  minAgeMonths: number | null,
  maxAgeMonths: number | null,
): string | null {
  if (minAgeMonths != null && maxAgeMonths != null)
    return `${formatAge(minAgeMonths)} – ${formatAge(maxAgeMonths)}`;
  if (minAgeMonths != null) return `from ${formatAge(minAgeMonths)}`;
  if (maxAgeMonths != null) return `up to ${formatAge(maxAgeMonths)}`;
  return null;
}

/**
 * A warning when the Child's age in completed months on the Academic Year's
 * first day is outside the Programme's range. Never a refusal.
 */
export function programmeAgeWarning(input: {
  dateOfBirth: IsoDate;
  academicYearStartsOn: IsoDate;
  programme: {
    name: string;
    minAgeMonths: number | null;
    maxAgeMonths: number | null;
  };
}): string | null {
  const { minAgeMonths, maxAgeMonths, name } = input.programme;
  const months = ageInMonths(input.dateOfBirth, input.academicYearStartsOn);
  const tooYoung = minAgeMonths != null && months < minAgeMonths;
  const tooOld = maxAgeMonths != null && months > maxAgeMonths;
  if (!tooYoung && !tooOld) return null;
  const range = ageRangeText(minAgeMonths, maxAgeMonths) ?? "";
  return `The Child is ${formatAge(months)} on ${input.academicYearStartsOn}, ${
    tooYoung ? "younger" : "older"
  } than ${name} (${range}).`;
}

export type ClassroomFacts = {
  id: string;
  centreId: string;
  programmeId: string;
  academicYearId: string;
  archived: boolean;
};

/** The Classroom must be in the Centre and Programme, and not archived. */
export function assertClassroomFor(
  classroom: ClassroomFacts,
  want: { centreId: string; programmeId: string; academicYearId?: string },
): void {
  if (classroom.centreId !== want.centreId)
    throw invalid(
      "CLASSROOM_OTHER_CENTRE",
      "The Classroom belongs to another Centre.",
    );
  if (classroom.programmeId !== want.programmeId)
    throw invalid(
      "CLASSROOM_PROGRAMME_MISMATCH",
      "The Classroom is for another Programme.",
    );
  if (
    want.academicYearId != null &&
    classroom.academicYearId !== want.academicYearId
  )
    throw invalid(
      "CLASSROOM_YEAR_MISMATCH",
      "The Classroom is for another Academic Year.",
    );
  if (classroom.archived)
    throw conflict("CLASSROOM_ARCHIVED", "The Classroom is archived.");
}

/** 409 `CLASSROOM_FULL` with the seats in `details` when no seat is left. */
export function assertSeatAvailable(seats: {
  capacity: number;
  filled: number;
}): void {
  if (seats.filled >= seats.capacity)
    throw conflict("CLASSROOM_FULL", "The Classroom has no seats left.", {
      capacity: seats.capacity,
      filled: seats.filled,
      seatsLeft: Math.max(0, seats.capacity - seats.filled),
    });
}

/** A move stays in the Programme and Academic Year, into another Classroom. */
export function assertClassroomMove(
  current: { classroomId: string; programmeId: string; academicYearId: string },
  target: ClassroomFacts,
): void {
  if (target.id === current.classroomId)
    throw conflict("SAME_CLASSROOM", "The Child is already in this Classroom.");
  if (target.programmeId !== current.programmeId)
    throw invalid(
      "CLASSROOM_PROGRAMME_MISMATCH",
      "Move to a Classroom of the same Programme, or promote the Child.",
    );
  if (target.academicYearId !== current.academicYearId)
    throw invalid(
      "CLASSROOM_YEAR_MISMATCH",
      "Move to a Classroom of the same Academic Year, or promote the Child.",
    );
}

/** Promotion is into a later Academic Year. */
export function assertPromotionYear(
  currentStartsOn: IsoDate,
  targetStartsOn: IsoDate,
): void {
  if (targetStartsOn <= currentStartsOn)
    throw invalid(
      "PROMOTION_YEAR_NOT_LATER",
      "Promote the Child into a later Academic Year.",
    );
}

/** An Admission cannot end before it began. */
export function assertEndsAfterAdmission(
  admittedOn: IsoDate,
  endedOn: IsoDate,
): void {
  if (endedOn < admittedOn)
    throw invalid(
      "DATE_BEFORE_ADMISSION",
      `The date must be on or after the Admission date (${admittedOn}).`,
    );
}
