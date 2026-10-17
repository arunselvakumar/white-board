import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { salesBookingDeps } from "@/src/composition/sales-bookings";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import { unitImportSampleRows } from "@/src/sales/application/unit-import";
import {
  unitImportSample,
  XLSX_CONTENT_TYPE,
} from "@/src/sales/infrastructure/unit-workbook";

import { ImportConstructionSalesUnitsRequestModel } from "../unit-models";

export const dynamic = "force-dynamic";

/**
 * The unit import sample (CM-1005): the headers, then every live unit of
 * the Project with its current sales details, ready to edit and upload.
 * Needs Booking read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionSalesUnitsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "read",
      query.projectId,
    );
    if (isResponse(session)) return session;
    const rows = await unitImportSampleRows(
      salesBookingDeps,
      session.access,
      query.projectId,
    );
    return new Response(await unitImportSample(rows), {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "units-import-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
