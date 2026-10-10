import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readHolidaySheet } from "@/src/hrms/infrastructure/holiday-workbook";

import { holidays } from "../handlers";
import {
  ImportConstructionHrmsHolidaysRequestModel,
  type ImportConstructionHrmsHolidaysResponseModel,
} from "../holiday-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Imports holidays from the sample sheet (CM-305). The body is the .xlsx
 * file itself. `?dryRun=true` (default) previews every row with its
 * errors; `?dryRun=false` adds every row in one transaction, or none: 400
 * `IMPORT_HAS_ERRORS` with the preview in `details`. Needs `create` on
 * Holiday Management.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.holidays", "create");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ImportConstructionHrmsHolidaysRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const upload = await readUpload(request, MAX_BYTES);
    const sheet = await readHolidaySheet(upload.bytes);
    if (query.dryRun !== "false") {
      const preview = await holidays.previewImport({
        access: session.access,
        sheet,
      });
      const body: ImportConstructionHrmsHolidaysResponseModel = {
        ...preview,
        imported: 0,
      };
      return Response.json(body);
    }
    const body: ImportConstructionHrmsHolidaysResponseModel =
      await holidays.commitImport({ access: session.access, sheet });
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
