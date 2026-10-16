import {
  getCompanyAuthFromHeaders,
  type CompanyRole,
} from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { requireCompanyNotBeingDeleted } from "@/app/api/_lib/company-deletion-guard";
import {
  backupDownloadPath,
  createBackupJobs,
} from "@/src/composition/backup-jobs";
import {
  backupDetail,
  backupTitle,
  type BackupJob,
} from "@/src/reporting/domain/backup-job";
import { backupModule } from "@/src/reporting/domain/backup-modules";
import { prismaProjectNames } from "@/src/reporting/infrastructure/prisma-report-source";

import {
  BACKUPS_PATH,
  type ConstructionReportingBackupResponseModel,
} from "./backup-models";

/** One set of backup handlers for every route (CM-906). */
export const backups = createBackupJobs();

const projectNames = prismaProjectNames(prisma);

/** A signed-in User, and their Active Company when they have one. */
export type BackupUserSession = {
  userId: string;
  sessionId: string;
  workspaceId: string | null;
  role: CompanyRole | null;
  email: string;
};

/**
 * 401 without a Session. Download My Data and its link need no Active
 * Company; when there is one, a write to it during its deletion
 * cooling-off follows the same guard as every route (backups stay open).
 */
export async function requireBackupUser(
  request: Request,
): Promise<BackupUserSession | Response> {
  const state = await getCompanyAuthFromHeaders(request.headers);
  if (!state.isAuthenticated)
    return jsonError(
      StatusCodes.UNAUTHORIZED,
      "UNAUTHENTICATED",
      "Authentication required.",
    );
  if (state.workspaceId != null) {
    const deleting = await requireCompanyNotBeingDeleted(
      request,
      state.workspaceId,
    );
    if (deleting != null) return deleting;
  }
  return {
    userId: state.userId,
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    role: state.role,
    email: state.user.email,
  };
}

/** A backup as the screens see it (its link only while it is done). */
export async function backupResponses(
  jobs: readonly BackupJob[],
): Promise<ConstructionReportingBackupResponseModel[]> {
  const byCompany = new Map<string, string[]>();
  for (const job of jobs)
    if (job.workspaceId != null && job.projectId != null)
      byCompany.set(job.workspaceId, [
        ...(byCompany.get(job.workspaceId) ?? []),
        job.projectId,
      ]);
  const names = new Map<string, string>();
  for (const [workspaceId, ids] of byCompany)
    for (const [id, name] of await projectNames.names(workspaceId, ids))
      names.set(id, name);
  return jobs.map((job) => ({
    id: job.id,
    scope: job.scope,
    title: backupTitle(job.scope, job.modules),
    detail: backupDetail(job),
    projectId: job.projectId,
    projectName:
      job.projectId == null ? null : (names.get(job.projectId) ?? null),
    modules: job.modules.map((key) => ({
      key,
      label: backupModule(key)?.label ?? key,
    })),
    from: job.fromDate,
    to: job.toDate,
    includeData: job.includeData,
    includeMedia: job.includeMedia,
    includesMoney: job.includesMoney,
    status: job.status,
    partsDone: job.parts.filter((part) => part.done).length,
    partsTotal: job.parts.length,
    error: job.status === "failed" ? job.error : null,
    fileName: job.fileName,
    bytes: job.bytes,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    downloadHref: backupDownloadPath(job),
    deleteHref: `${BACKUPS_PATH}/${job.id}/delete`,
  }));
}

export async function backupResponse(
  job: BackupJob,
): Promise<ConstructionReportingBackupResponseModel> {
  const [one] = await backupResponses([job]);
  if (one == null) throw new Error("No backup response.");
  return one;
}
