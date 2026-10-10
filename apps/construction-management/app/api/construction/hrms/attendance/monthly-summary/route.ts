import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsMonthRequestModel,
  toMonthlySummaryResponse,
} from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Each member's month: day statuses and counts (CM-309; `report`). Every
 * active member with `view_all`, else the viewer's own row.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "report");
    if (isResponse(session)) return session;
    const { month } = parseOrThrow(
      ConstructionHrmsMonthRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const summary = await attendance.monthlySummary({
      access: session.access,
      month,
    });
    return Response.json(toMonthlySummaryResponse(summary));
  } catch (error) {
    return mapError(error);
  }
}
