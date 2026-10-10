import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  attendanceMonthWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/src/hrms/infrastructure/attendance-workbook";

import { ConstructionHrmsMonthRequestModel } from "../../attendance-models";
import { attendance } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * The monthly attendance report as Excel (CM-309; `export`): a summary
 * sheet and a member × day sheet. Same rows as the monthly summary.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "export");
    if (isResponse(session)) return session;
    const { month } = parseOrThrow(
      ConstructionHrmsMonthRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const summary = await attendance.monthlyReport({
      access: session.access,
      month,
    });
    const bytes = await attendanceMonthWorkbook(summary);
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": `attachment; filename="attendance-${month}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
