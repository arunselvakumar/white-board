import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import type { ReportKind, ReportJob } from "@/src/reporting/domain/report-job";
import { createReportJobs } from "@/src/composition/report-jobs";
import {
  canBeCentral,
  hasOwnModule,
  REPORT_KINDS,
} from "@/src/reporting/domain/report-job";
import {
  can,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/** One set of report handlers for every route (CM-217, CM-218). */
export const reports = createReportJobs();

/**
 * The menu whose Report flag a kind needs (and whose Financial puts
 * amounts in its files). Labour reports sit under Labour, the vendor
 * report under Vendor (`modules/08` decisions); the Reports page that
 * lists them is behind Reports (`reporting.project_reports`) Read. The Daily Progress Report sits under Progress
 * Report, which has no Report flag: it is requested, listed and deleted
 * from the Project's Progress Reports module (C / R / D, CM-606), never
 * from these routes.
 */
export const REPORT_MENU: Record<ReportKind, MenuKey> = {
  labour_attendance: "labour.labour",
  labour_payment: "labour.labour",
  labour_month: "labour.labour",
  muster_roll: "labour.labour",
  vendor_attendance: "labour.vendor",
  // Site work reports (CM-605, CM-608): Daily Work under Daily Worksheet,
  // usage under Equipment Usage (hire cost with its Financial), maintenance
  // and transfers under Equipments (maintenance cost with its Financial).
  daily_work: "site_work.daily_worksheet",
  owned_equipment_usage: "site_work.equipment_usage",
  rented_equipment_usage: "site_work.equipment_usage",
  equipment_maintenance: "masters.equipments",
  equipment_transfers: "masters.equipments",
  // CM-606: never through these routes (`hasOwnModule`).
  daily_progress_report: "site_work.progress_reports",
};

function scope(projectId: string | null) {
  return projectId == null ? {} : { projectId };
}

/**
 * The `report` flag on the kind's menu (and the Project). Never for a
 * kind with its own module: those routes check their own flags.
 */
export function canReport(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  if (hasOwnModule(kind)) return false;
  return can(access, REPORT_MENU[kind], "report", scope(projectId));
}

/** Financial on the kind's menu: amounts in the files. */
export function canSeeMoney(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
  return can(access, REPORT_MENU[kind], "financial", scope(projectId));
}

/** The kinds this Team Member may report on for a Project (or centrally). */
export function reportableKinds(
  access: MemberAccess,
  projectId: string | null,
): ReportKind[] {
  return REPORT_KINDS.filter(
    (kind) =>
      (projectId != null || canBeCentral(kind)) &&
      canReport(access, kind, projectId),
  );
}

export function permissionDenied(
  message = "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
): Response {
  return jsonError(StatusCodes.FORBIDDEN, "PERMISSION_DENIED", message);
}

/** The Session and the Permission Matrix, checked per job by the caller. */
export async function requireReportSession(
  request: Request,
): Promise<AccessSession | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  return { ...session, access };
}

/**
 * A job this Team Member may open: `report` on its menu and Project. A
 * central report covers the requester's Projects, so only they and the
 * Owner may open it.
 */
export function mayOpen(session: AccessSession, job: ReportJob): boolean {
  if (!canReport(session.access, job.kind, job.projectId)) return false;
  if (job.projectId == null)
    return session.role === "owner" || job.requestedBy === session.userId;
  return true;
}
