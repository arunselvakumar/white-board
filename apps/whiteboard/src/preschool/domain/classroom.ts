import { conflict, invalid } from "./errors";

export const MAX_CLASSROOM_CAPACITY = 200;

/** Trims the name; throws 400 when it is empty or too long. */
export function classroomName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw invalid("CLASSROOM_NAME_REQUIRED", "Enter the Classroom's name.");
  if (trimmed.length > 100)
    throw invalid(
      "CLASSROOM_NAME_TOO_LONG",
      "A Classroom's name can be at most 100 characters.",
    );
  return trimmed;
}

/** Names compare without case or repeated spaces. */
export function classroomNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Capacity is a whole number of seats, at least one. */
export function assertCapacity(capacity: number): void {
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > MAX_CLASSROOM_CAPACITY
  )
    throw invalid(
      "CLASSROOM_CAPACITY_INVALID",
      `Capacity must be 1 to ${MAX_CLASSROOM_CAPACITY}.`,
    );
}

/** A Classroom cannot shrink below the Children already in it. */
export function assertCapacityHolds(
  capacity: number,
  childCount: number,
): void {
  if (capacity < childCount)
    throw conflict(
      "CLASSROOM_CAPACITY_BELOW_CHILDREN",
      `This Classroom has ${childCount} ${childCount === 1 ? "Child" : "Children"}; capacity cannot be lower.`,
      { childCount },
    );
}

export function seatsLeft(capacity: number, childCount: number): number {
  return Math.max(0, capacity - childCount);
}

export type ClassTeacherCandidate = {
  id: string;
  name: string;
  centreId: string;
  role: "centre_head" | "teacher" | "helper";
  status: "active" | "inactive";
};

/**
 * A Class Teacher is an active Teacher or Centre Head of the Classroom's
 * Centre. Helpers have no sign-in, so they cannot be one.
 */
export function assertClassTeachers(
  centreId: string,
  staff: readonly ClassTeacherCandidate[],
): void {
  for (const member of staff) {
    if (member.centreId !== centreId)
      throw invalid(
        "CLASS_TEACHER_OTHER_CENTRE",
        `${member.name} works at another Centre.`,
      );
    if (member.role === "helper")
      throw invalid(
        "CLASS_TEACHER_ROLE",
        `${member.name} is a helper; only Teachers and Centre Heads can be Class Teachers.`,
      );
    if (member.status !== "active")
      throw conflict("STAFF_INACTIVE", `${member.name} is inactive.`);
  }
}
