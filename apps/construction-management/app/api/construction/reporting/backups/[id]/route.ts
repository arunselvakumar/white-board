import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionReportingBackupParamsModel } from "../backup-models";
import { backupResponse, backups, requireBackupUser } from "../handlers";

export const dynamic = "force-dynamic";
/** A read nudges a stuck backup, which drains in `after()` (ADR CM-0021 §1). */
export const maxDuration = 300;

/**
 * One of the signed-in User's own backups or data exports (CM-906), with
 * its signed download link while it is done. Anyone else's is 404.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionReportingBackupParamsModel.safeParse(await context.params),
    );
    const user = await requireBackupUser(request);
    if (isResponse(user)) return user;
    const job = await backups.getOwn(id, user.userId);
    return Response.json(await backupResponse(job));
  } catch (error) {
    return mapError(error);
  }
}
