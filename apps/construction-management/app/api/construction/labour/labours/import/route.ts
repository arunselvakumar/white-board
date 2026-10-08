import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readLabourSheet } from "@/src/labour/infrastructure/labour-workbook";

import { labour } from "../handlers";
import {
  ImportConstructionLabourLaboursRequestModel,
  type ImportConstructionLabourLaboursResponseModel,
} from "../labour-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Imports labourers from the sample sheet (CM-206). The body is the .xlsx
 * file itself. `?dryRun=true` (default) previews every row with its
 * errors; `?dryRun=false` adds all rows in one transaction, or none: 400
 * `IMPORT_HAS_ERRORS` with the preview in `details`. Needs `create` on
 * Labours.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "create");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ImportConstructionLabourLaboursRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const dryRun = query.dryRun !== "false";
    const upload = await readUpload(request, MAX_BYTES);
    const sheet = await readLabourSheet(upload.bytes);
    if (dryRun) {
      const preview = await labour.importer.preview(session.workspaceId, sheet);
      const body: ImportConstructionLabourLaboursResponseModel = {
        ...preview,
        imported: 0,
      };
      return Response.json(body);
    }
    const result = await labour.importer.commit({
      workspaceId: session.workspaceId,
      sheet,
      by: session.userId,
    });
    const body: ImportConstructionLabourLaboursResponseModel = result;
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
