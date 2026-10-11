import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createProgressReportHandlers } from "@/src/composition/progress-reports";
import type { ProgressReportJob } from "@/src/site-work/application/ports";
import { PROGRESS_REPORT_MENU } from "@/src/site-work/domain/progress-report";
import type { Flag } from "@/src/shared-kernel/access";

export { PROGRESS_REPORT_MENU };

/**
 * One set of Progress Reports handlers for every route (CM-606). The
 * DPR is a reporting job, but its routes live here: it is numbered by site
 * work and guarded by the Progress Report menu (C / R / D), not by the
 * Reports page's Report flag.
 */
export const progressReports = createProgressReportHandlers();

/**
 * The Session plus the Permission Matrix check for a route about one DPR:
 * the job is loaded first (404 for another Company's or another kind of
 * report), then `flag` is checked on its Project.
 */
export async function requireProgressReportAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: ProgressReportJob }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await progressReports.find(session.workspaceId, id);
  const access = await requireAccess(request, PROGRESS_REPORT_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}
