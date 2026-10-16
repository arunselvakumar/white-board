import { companies } from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { backupLinkSecret } from "@/src/composition/backup-jobs";
import { checkBackupLink } from "@/src/reporting/domain/backup-link";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import {
  ConstructionReportingBackupParamsModel,
  DownloadConstructionReportingBackupRequestModel,
} from "../../backup-models";
import { backups, requireBackupUser } from "../../handlers";

export const dynamic = "force-dynamic";

function invalid(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "BACKUP_LINK_INVALID",
    "This download link is not valid for you. Open the backup from Downloads.",
  );
}

function expired(): Response {
  return jsonError(
    StatusCodes.GONE,
    "BACKUP_LINK_EXPIRED",
    "This download link has expired. Make a new backup.",
  );
}

/**
 * Streams a finished backup's ZIP through its signed link (CM-906, ADR
 * CM-0021 §8). In order: 404 for no such backup; 403
 * `BACKUP_LINK_INVALID` when the signature does not match (tampered, or
 * another backup's), when the signed-in User is not its requester, or no
 * longer belongs to its Company; 410 `BACKUP_LINK_EXPIRED` past the
 * link's 7 days or once retention has deleted the file; 409
 * `BACKUP_NOT_READY` while it is not done.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionReportingBackupParamsModel.safeParse(await context.params),
    );
    const query = DownloadConstructionReportingBackupRequestModel.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const user = await requireBackupUser(request);
    if (isResponse(user)) return user;
    const job = await backups.get(id);
    if (job == null)
      return jsonError(
        StatusCodes.NOT_FOUND,
        "BACKUP_NOT_FOUND",
        "There is no such backup.",
      );
    if (!query.success) return invalid();
    const check = checkBackupLink({
      secret: backupLinkSecret(),
      backupId: job.id,
      requestedBy: job.requestedBy,
      viewerUserId: user.userId,
      expires: query.data.expires,
      signature: query.data.sig,
      now: new Date(),
    });
    if (!check.ok) return check.reason === "expired" ? expired() : invalid();
    if (job.workspaceId != null) {
      const mine = await companies.listForUser(user.userId);
      if (!mine.some((company) => company.id === job.workspaceId))
        return invalid();
    }
    if (
      job.status === "expired" ||
      (job.expiresAt != null && job.expiresAt.getTime() <= Date.now())
    )
      return expired();
    if (job.status !== "done" || job.fileKey == null)
      return jsonError(
        StatusCodes.CONFLICT,
        "BACKUP_NOT_READY",
        job.status === "failed"
          ? "This backup failed; make a new one."
          : "This backup is still being made.",
      );
    const file = await objectStorage().get(job.fileKey);
    if (file == null) return expired();
    const headers: Record<string, string> = {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${job.fileName ?? "backup.zip"}"`,
      "cache-control": "private, no-store",
    };
    if (file.contentLength != null)
      headers["content-length"] = String(file.contentLength);
    return new Response(file.body, { headers });
  } catch (error) {
    return mapError(error);
  }
}
