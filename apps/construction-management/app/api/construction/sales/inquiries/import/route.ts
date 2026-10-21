import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { readInquirySheet } from "@/src/sales/infrastructure/inquiry-workbook";

import { INQUIRY_MENU, inquiryHandlers as handlers } from "../handlers";
import { ImportConstructionSalesInquiriesRequestModel } from "../inquiry-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Imports inquiries from the sample (CM-1007, ADR CM-0022 §9): the body is
 * the .xlsx itself. Every row becomes an inquiry of the Project or none
 * does: 400 `IMPORT_HAS_ERRORS` with `details.errors` = [{ row, field,
 * message }], `IMPORT_EMPTY`, `IMPORT_TOO_MANY` (over 1,000 rows),
 * `IMPORT_FILE_INVALID`. A duplicate mobile or email is a row error unless
 * `allowDuplicates=true`. Needs Inquiry create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionSalesInquiriesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireSalesProjectAccess(
      request,
      INQUIRY_MENU,
      "create",
      query.projectId,
    );
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readInquirySheet(upload.bytes);
    return Response.json(
      await handlers.importSheet(
        session.access,
        query.projectId,
        rows,
        query.allowDuplicates === "true",
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
