import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  XLSX_CONTENT_TYPE,
  holidaySample,
} from "@/src/hrms/infrastructure/holiday-workbook";

import { holidays } from "../handlers";
import { SampleConstructionHrmsHolidaysRequestModel } from "../holiday-models";

export const dynamic = "force-dynamic";

/** The sample Excel sheet for the holiday import (CM-305). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.holidays", "read");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      SampleConstructionHrmsHolidaysRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const year =
      query.year == null
        ? await holidays.sampleYear({ access: session.access })
        : Number(query.year);
    const bytes = await holidaySample(year);
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="holidays-sample-${String(year)}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
