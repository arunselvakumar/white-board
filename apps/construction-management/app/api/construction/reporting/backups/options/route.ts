import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { backupOptions } from "@/src/reporting/application/backup-access";

import { requireReportSession } from "../../reports/handlers";
import {
  ListConstructionReportingBackupOptionsRequestModel,
  type ListConstructionReportingBackupOptionsResponseModel,
} from "../backup-models";

export const dynamic = "force-dynamic";

/**
 * What the backup dialogs offer (CM-906): the Project's modules (or the
 * masters) the member may back up, each saying whether its files would
 * carry amounts and whether it has media. Empty without Project View.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionReportingBackupOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const body: ListConstructionReportingBackupOptionsResponseModel = {
      modules: backupOptions(
        session.access,
        query.scope,
        query.projectId ?? null,
      ).map(({ module, money }) => ({
        key: module.key,
        label: module.label,
        group: module.group,
        includesMoney: money,
        hasMedia: module.media,
      })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
