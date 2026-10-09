import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import type { ReportKind, ReportJob } from "@/src/reporting/domain/report-job";
import { REPORT_KINDS } from "@/src/reporting/domain/report-job";
import { createReportingHandlers } from "@/src/reporting/infrastructure/create-report-handlers";
import {
  can,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/** One set of report handlers for every route (CM-217, CM-218). */
export const reports = createReportingHandlers();

/** Labour reports sit under Labour, the vendor report under Vendor (`modules/08` decisions). */
export const REPORT_MENU: Record<ReportKind, MenuKey> = {
  labour_attendance: "labour.labour",
  labour_payment: "labour.labour",
  labour_month: "labour.labour",
  muster_roll: "labour.labour",
  vendor_attendance: "labour.vendor",
};

function scope(projectId: string | null) {
  return projectId == null ? {} : { projectId };
}

/** The `report` flag on the kind's menu (and the Project). */
export function canReport(
  access: MemberAccess,
  kind: ReportKind,
  projectId: string | null,
): boolean {
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
      (projectId != null || kind === "vendor_attendance") &&
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
