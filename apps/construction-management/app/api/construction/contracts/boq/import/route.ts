import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { readBoqSheet } from "@/src/contracts/infrastructure/boq-workbook";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";
import { toImportResponse } from "../boq-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Imports sections and items from the sample (CM-1103); the body is the
 * .xlsx itself and `?projectId=` names the Project. Sections are matched
 * by title and new ones added in the order first named; items by Item no
 * ignoring case (new numbers added, existing ones updated, a measured
 * item's quantity and rate refused). All rows or none: 400
 * `IMPORT_HAS_ERRORS` with `details.errors` = [{ row, column, message }],
 * `IMPORT_EMPTY`, `IMPORT_TOO_MANY` (over 5,000), `IMPORT_FILE_INVALID`.
 * Needs BOQ Import and Financial.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireBoqProjectAccess(request, "import", projectId);
    if (isResponse(session)) return session;
    boqHandlers.assertCanImport(session.access, projectId);
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readBoqSheet(upload.bytes);
    return Response.json(
      toImportResponse(
        await boqHandlers.importSheet(session.access, projectId, rows),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
