import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

import { calendarDateToDb, todayIn } from "@/src/shared-kernel/calendar-date";

/**
 * Documents for the dashboard tests (CM-902), written straight to the
 * tables: the views are read-side, so these rows only need to exist with
 * the status a list filters on.
 */

type Approval = "pending" | "approved" | "rejected";

const TODAY = todayIn("Asia/Kolkata");

function stamp(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

function tombstone(by: string, deleted: boolean | undefined) {
  return deleted === true
    ? { deletedAt: new Date(), deletedBy: by }
    : { deletedAt: null };
}

/** A Purchase Request of the Project with no items. */
export async function dashboardPurchaseRequest(
  workspaceId: string,
  by: string,
  projectId: string,
  options: { approvalStatus?: Approval; deleted?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionProcurementPurchaseRequest.create({
    data: {
      id,
      workspaceId,
      projectId,
      number: `PR/TEST/${id.slice(0, 8)}`,
      requestDate: calendarDateToDb(TODAY),
      approvalStatus: options.approvalStatus ?? "pending",
      ...stamp(by),
      ...tombstone(by, options.deleted),
    },
  });
  return id;
}

/** A Material Transfer out of the Project to another one, with no items. */
export async function dashboardMaterialTransfer(
  workspaceId: string,
  by: string,
  input: {
    fromProjectId: string;
    toProjectId: string;
    approvalStatus?: Approval;
    deleted?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionProcurementMaterialTransfer.create({
    data: {
      id,
      workspaceId,
      number: `MT/TEST/${id.slice(0, 8)}`,
      transferDate: calendarDateToDb(TODAY),
      fromKind: "project",
      fromId: input.fromProjectId,
      toKind: "project",
      toId: input.toProjectId,
      approvalStatus: input.approvalStatus ?? "pending",
      ...stamp(by),
      ...tombstone(by, input.deleted),
    },
  });
  return id;
}

/** Sets a Daily Worksheet's or Equipment Usage sheet's approval status. */
export async function dashboardSheetStatus(
  kind: "worksheet" | "equipment_usage",
  id: string,
  approvalStatus: Approval | "not_required",
): Promise<void> {
  if (kind === "worksheet")
    await prisma.constructionSiteWorkWorksheet.update({
      where: { id },
      data: { approvalStatus },
    });
  else
    await prisma.constructionSiteWorkEquipmentUsageSheet.update({
      where: { id },
      data: { approvalStatus },
    });
}

/** One Labour's attendance on the Project for the day (a new Labour). */
export async function dashboardLabourAttendance(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    date: string;
    status: "present" | "half_day" | "absent" | "on_leave" | "holiday";
  },
): Promise<void> {
  const labourId = randomUUID();
  const now = new Date();
  await prisma.constructionLabourLabour.create({
    data: {
      id: labourId,
      workspaceId,
      name: `Labour ${labourId.slice(0, 6)}`,
      wageType: "daily",
      wagePerDay: 800_00,
      overtimeWagePerHour: 100_00,
      weeklyHolidays: [],
      joiningDate: calendarDateToDb(input.date),
      projects: {
        create: {
          workspaceId,
          projectId: input.projectId,
          since: calendarDateToDb(input.date),
        },
      },
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
    },
  });
  await prisma.constructionLabourAttendance.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId: input.projectId,
      labourId,
      attendanceDate: calendarDateToDb(input.date),
      status: input.status,
      wageType: "daily",
      wageRate: 800_00,
      earned: input.status === "present" ? 800_00 : 0,
      createdAt: now,
      updatedAt: now,
      createdBy: by,
      updatedBy: by,
    },
  });
}
