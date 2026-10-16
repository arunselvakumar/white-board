import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionReportingBackupParamsModel } from "../../backup-models";
import { backups, requireBackupUser } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes one of the User's own backups or data exports with its ZIP and
 * any parts (CM-906); its link stops working. Anyone else's is 404.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionReportingBackupParamsModel.safeParse(await context.params),
    );
    const user = await requireBackupUser(request);
    if (isResponse(user)) return user;
    await backups.handlers.delete(id, user.userId);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
