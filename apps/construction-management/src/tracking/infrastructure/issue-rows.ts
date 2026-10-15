import type { Prisma } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import type { TrackingTx } from "../application/ports";
import type { TrackingPriority } from "../domain/tracking-documents";

/**
 * A new Issue & Snag row, already validated by the caller: references
 * checked through `TrackingDirectory`, the location through the
 * `LocationResolver`, the Issue Date through the back-dated policy, and
 * `dueDate >= issueDate`. Text is trimmed; empty optional fields are null.
 */
export type NewIssueRow = {
  workspaceId: string;
  projectId: string;
  /** User id of who raises it (`created_by`, the event and the audit). */
  by: string;
  /** Server time of the command. */
  at: Date;
  /** Chosen by the caller when it must know the id first; a new uuid v7 otherwise. */
  id?: string;
  issueDate: CalendarDate;
  details: string;
  priority: TrackingPriority | null;
  /** An enabled Issue Category. */
  categoryId: string | null;
  departmentId: string | null;
  contractorId: string | null;
  /** A Team Member id (not a User id) on the Project. */
  assigneeMemberId: string | null;
  dueDate: CalendarDate | null;
  siteLocation: LocationRef | null;
  /**
   * `open` (Save) or `solved` (Save & Mark As Solved, CM-0019 §7): a
   * solved issue records Solved On = `at` and Solved By = `by`.
   */
  status: "open" | "solved";
  /** The rejected Inspection Request it was raised from (CM-0019 §10). */
  sourceInspectionId: string | null;
};

export type InsertedIssue = { id: string; number: string };

/** What the audit log keeps of a new issue. */
function snapshot(row: NewIssueRow, number: string) {
  return {
    number,
    projectId: row.projectId,
    issueDate: row.issueDate,
    details: row.details,
    priority: row.priority,
    categoryId: row.categoryId,
    departmentId: row.departmentId,
    contractorId: row.contractorId,
    assigneeMemberId: row.assigneeMemberId,
    dueDate: row.dueDate,
    siteLocation: row.siteLocation,
    status: row.status,
    sourceInspectionId: row.sourceInspectionId,
  };
}

/**
 * Inserts one Issue & Snag inside the caller's transaction (CM-0019 §7,
 * §10): takes the next number of the **Issue & Snag (ISS)** numbering
 * module for the Project on the Issue Date, writes the row, its `created`
 * lifecycle event (and `solved` when created solved), and an
 * `issue.created` audit event. Used by the Issues routes (normal create)
 * and by the inspection reject (snag from a rejection), so both number
 * and record issues the same way.
 *
 * Domain events (`IssueAssigned` …) are the caller's to raise after commit.
 */
export async function insertIssueRow(
  tx: TrackingTx,
  row: NewIssueRow,
): Promise<InsertedIssue> {
  const id = row.id ?? newId(row.at.getTime());
  const { number } = await nextSequenceNumber(tx, {
    workspaceId: row.workspaceId,
    module: "issue",
    projectId: row.projectId,
    date: row.issueDate,
    by: row.by,
  });
  const solved = row.status === "solved";
  await tx.constructionTrackingIssue.create({
    data: {
      id,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      number,
      issueDate: calendarDateToDb(row.issueDate),
      details: row.details,
      priority: row.priority,
      categoryId: row.categoryId,
      departmentId: row.departmentId,
      contractorId: row.contractorId,
      assigneeMemberId: row.assigneeMemberId,
      dueDate: row.dueDate == null ? null : calendarDateToDb(row.dueDate),
      siteLocationType: row.siteLocation?.type ?? null,
      // No location is left out, so the column stays SQL NULL (`next dev`
      // writes `Prisma.DbNull` as `{}`; see the M6 handoff).
      ...(row.siteLocation == null
        ? {}
        : {
            siteLocation: JSON.parse(
              JSON.stringify(row.siteLocation),
            ) as Prisma.InputJsonValue,
          }),
      status: row.status,
      solvedAt: solved ? row.at : null,
      solvedBy: solved ? row.by : null,
      sourceInspectionId: row.sourceInspectionId,
      createdAt: row.at,
      updatedAt: row.at,
      createdBy: row.by,
      updatedBy: row.by,
    },
  });
  // Ids in the order the events happened (uuid v7 sorts by time).
  const event = (kind: string, order: number) => ({
    id: newId(row.at.getTime() + order),
    workspaceId: row.workspaceId,
    issueId: id,
    kind,
    createdAt: row.at,
    createdBy: row.by,
  });
  await tx.constructionTrackingIssueEvent.createMany({
    data: [
      {
        ...event("created", 0),
        ...(row.sourceInspectionId == null
          ? {}
          : { payload: { sourceInspectionId: row.sourceInspectionId } }),
      },
      ...(solved ? [event("solved", 1)] : []),
    ],
  });
  await recordAudit(tx, {
    workspaceId: row.workspaceId,
    actorUserId: row.by,
    action: "issue.created",
    entityType: "issue",
    entityId: id,
    after: snapshot(row, number),
    occurredAt: row.at,
  });
  return { id, number };
}
