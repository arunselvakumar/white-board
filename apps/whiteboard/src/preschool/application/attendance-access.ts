import type { IsoDate } from "../domain/dates";
import { conflict, forbidden, notFound } from "../domain/errors";
import {
  assertCentre,
  assertClassroom,
  canReadChild,
  type PreschoolActor,
} from "./access";
import type { ChildPlacement, RosterReader } from "./attendance-ports";
import type { AttendanceClassroomView } from "./attendance-views";

// Who may open a Classroom's day or a Child's day, shared by attendance and
// Daily Reports.

/** 404 for another Workspace's Classroom; 403 outside the actor's Centres or Classrooms. */
export async function openClassroom(
  reader: RosterReader,
  actor: PreschoolActor,
  classroomId: string,
): Promise<AttendanceClassroomView> {
  const classroom = await reader.classroom(actor.workspaceId, classroomId);
  if (classroom == null)
    throw notFound("CLASSROOM_NOT_FOUND", "Classroom not found.");
  assertCentre(actor, classroom.centreId);
  assertClassroom(actor, classroom);
  return classroom;
}

/**
 * The Child's Classroom on `date`, checked like `openClassroom`. A Child who
 * is on no roster that day is 409 `CHILD_NOT_ON_ROSTER`.
 */
export async function placeChild(
  reader: RosterReader,
  actor: PreschoolActor,
  childId: string,
  date: IsoDate,
): Promise<{ child: ChildPlacement; classroom: AttendanceClassroomView }> {
  const child = await reader.placement(actor.workspaceId, childId, date);
  if (child == null) throw notFound("CHILD_NOT_FOUND", "Child not found.");
  assertCentre(actor, child.centreId);
  if (child.classroomId == null)
    throw conflict(
      "CHILD_NOT_ON_ROSTER",
      "The Child is not in a Classroom on this day.",
    );
  return {
    child,
    classroom: await openClassroom(reader, actor, child.classroomId),
  };
}

/** Every Child of the request must be on this roster: 409 `CHILD_NOT_ON_ROSTER`. */
export function assertOnRoster(
  rosterIds: ReadonlySet<string>,
  childIds: readonly string[],
): void {
  const missing = childIds.filter((id) => !rosterIds.has(id));
  if (missing.length > 0)
    throw conflict(
      "CHILD_NOT_ON_ROSTER",
      "Some Children are not in this Classroom on this day.",
      { childIds: missing },
    );
}

/**
 * Reading a Child's days: staff of the Centre (a Teacher only for a Child now
 * in their Classroom) and the Child's own Parents.
 */
export async function readableChild(
  reader: RosterReader,
  actor: PreschoolActor,
  childId: string,
  today: IsoDate,
): Promise<ChildPlacement> {
  const child = await reader.placement(actor.workspaceId, childId, today);
  if (child == null) throw notFound("CHILD_NOT_FOUND", "Child not found.");
  if (!canReadChild(actor, { id: child.childId, centreId: child.centreId }))
    throw actor.role === "parent"
      ? forbidden("CHILD_FORBIDDEN", "This is not your Child.")
      : forbidden("CENTRE_FORBIDDEN", "You do not have access to this Centre.");
  if (
    actor.role === "teacher" &&
    (child.classroomId == null ||
      !actor.classroomIds.includes(child.classroomId))
  )
    throw forbidden(
      "CHILD_FORBIDDEN",
      "This Child is not in one of your Classrooms.",
    );
  return child;
}
