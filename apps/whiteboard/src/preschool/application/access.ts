import { forbidden } from "../domain/errors";

/**
 * What a signed-in User is in a Preschool Workspace (ADR-0055).
 * - `owner`: Head Office. Every Centre.
 * - `centre_head`: everything inside their Centres, fees included.
 * - `teacher`: their Classrooms. Never fee amounts.
 * - `parent`: their own Children, read only.
 */
export type PreschoolRole = "owner" | "centre_head" | "teacher" | "parent";

/** Who is asking. Every handler takes one as its first argument. */
export type PreschoolActor = {
  workspaceId: string;
  userId: string;
  userName: string;
  role: PreschoolRole;
  /** Centres the User may open. For the Owner, every Centre that is not deleted. */
  centreIds: readonly string[];
  /** A Teacher's Classrooms. Empty for every other role. */
  classroomIds: readonly string[];
  /** A Parent's Children. Empty for every other role. */
  childIds: readonly string[];
};

export const STAFF_ROLES = ["owner", "centre_head", "teacher"] as const;
export const MANAGER_ROLES = ["owner", "centre_head"] as const;

export function isManager(actor: PreschoolActor): boolean {
  return actor.role === "owner" || actor.role === "centre_head";
}

export function canOpenCentre(
  actor: PreschoolActor,
  centreId: string,
): boolean {
  return actor.centreIds.includes(centreId);
}

/** 403 `CENTRE_FORBIDDEN` unless the User may open the Centre. */
export function assertCentre(actor: PreschoolActor, centreId: string): void {
  if (!canOpenCentre(actor, centreId))
    throw forbidden(
      "CENTRE_FORBIDDEN",
      "You do not have access to this Centre.",
    );
}

/** 403 `FORBIDDEN` unless the User has one of the roles. */
export function assertRole(
  actor: PreschoolActor,
  roles: readonly PreschoolRole[],
  message = "You do not have access to this.",
): void {
  if (!roles.includes(actor.role)) throw forbidden("FORBIDDEN", message);
}

/** Owner or Centre Head of the Centre. */
export function assertManagerOf(actor: PreschoolActor, centreId: string): void {
  assertRole(actor, MANAGER_ROLES);
  assertCentre(actor, centreId);
}

/**
 * A Classroom the User may work in: any Classroom of their Centres for the
 * Owner and Centre Heads, only their own for a Teacher.
 */
export function canOpenClassroom(
  actor: PreschoolActor,
  classroom: { id: string; centreId: string },
): boolean {
  if (!canOpenCentre(actor, classroom.centreId)) return false;
  if (actor.role === "teacher")
    return actor.classroomIds.includes(classroom.id);
  return actor.role === "owner" || actor.role === "centre_head";
}

export function assertClassroom(
  actor: PreschoolActor,
  classroom: { id: string; centreId: string },
): void {
  if (!canOpenClassroom(actor, classroom))
    throw forbidden(
      "CLASSROOM_FORBIDDEN",
      "You do not have access to this Classroom.",
    );
}

/** A Parent may read only their own Children. */
export function canReadChild(
  actor: PreschoolActor,
  child: { id: string; centreId: string },
): boolean {
  if (actor.role === "parent") return actor.childIds.includes(child.id);
  return canOpenCentre(actor, child.centreId);
}

/** What the access reader is asked: the Session's facts, nothing decided yet. */
export type AccessQuery = {
  workspaceId: string;
  userId: string;
  userName: string;
  /** The Workspace member role from `@repo/auth`. */
  memberRole: "owner" | "teacher" | "student" | "parent";
  /** The User's verified emails, lower case. Staff and Parents are linked by these. */
  verifiedEmails: readonly string[];
};

export type AccessResult =
  | { kind: "actor"; actor: PreschoolActor }
  /** The Workspace has no Preschool settings row. */
  | { kind: "not_a_preschool" }
  /** A member the Preschool has no Staff record or Child for. */
  | { kind: "no_access" };

export type AccessReader = {
  resolve(query: AccessQuery): Promise<AccessResult>;
};
