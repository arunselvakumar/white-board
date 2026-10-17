import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { salesBookingDeps } from "@/src/composition/sales-bookings";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import { importUnitProfiles } from "@/src/sales/application/unit-import";
import { readUnitSheet } from "@/src/sales/infrastructure/unit-workbook";

import { ImportConstructionSalesUnitsRequestModel } from "../unit-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Imports unit sales details from the sample (CM-1005, ADR CM-0022 §8):
 * the body is the .xlsx itself. Each row replaces an existing unit's
 * profile, matched by Wing name and Unit No ignoring case; Wings, Floors
 * and Units are never created. All rows or none: 400
 * `IMPORT_HAS_ERRORS` with `details.errors` = [{ row, field, message }];
 * at most 2,000 rows. Needs Booking update on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionSalesUnitsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "update",
      query.projectId,
    );
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readUnitSheet(upload.bytes);
    return Response.json(
      await importUnitProfiles(
        salesBookingDeps,
        session.access,
        query.projectId,
        rows,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
