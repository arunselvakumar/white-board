import { forbidden, invalid } from "./errors";

export type StaffRole = "centre_head" | "teacher" | "helper";

/** Centre Heads and Teachers sign in; helpers are records only. */
export function canSignIn(role: StaffRole): boolean {
  return role !== "helper";
}

/** Trims the name; throws 400 when it is empty or too long. */
export function staffName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw invalid("STAFF_NAME_REQUIRED", "Enter the Staff member's name.");
  if (trimmed.length > 200)
    throw invalid(
      "STAFF_NAME_TOO_LONG",
      "A name can be at most 200 characters.",
    );
  return trimmed;
}

/** Lower case, or null when blank. */
export function staffEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? "";
  if (trimmed === "") return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    throw invalid("STAFF_EMAIL_INVALID", "Enter a valid email address.");
  return trimmed;
}

/** Only the Owner adds, changes, or invites a Centre Head. */
export function assertMayManageStaffRole(
  actorIsOwner: boolean,
  ...roles: readonly StaffRole[]
): void {
  if (roles.includes("centre_head") && !actorIsOwner)
    throw forbidden(
      "CENTRE_HEAD_OWNER_ONLY",
      "Only the Owner can add or change a Centre Head.",
    );
}

/** Helpers cannot be Class Teachers. */
export function assertClassroomsAllowed(
  role: StaffRole,
  classroomIds: readonly string[],
): void {
  if (role === "helper" && classroomIds.length > 0)
    throw invalid("CLASS_TEACHER_ROLE", "A helper cannot be a Class Teacher.");
}
