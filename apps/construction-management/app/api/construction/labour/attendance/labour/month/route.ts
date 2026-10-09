import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  labourAttendanceHandlers as handlers,
  labourFinancial,
} from "../handlers";
import {
  GetConstructionLabourLabourAttendanceMonthRequestModel,
  toLabourAttendanceMonthResponse,
} from "../labour-attendance-models";

export const dynamic = "force-dynamic";

/**
 * The month grid (CM-211): labourer × day codes (P/H/A/L/PL/HO) with
 * overtime hours, and totals per labourer. Needs Attendance read; earned
 * amounts need Labour Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionLabourLabourAttendanceMonthRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const month = await handlers.month(
      session.workspaceId,
      model.projectId,
      model.month,
    );
    return Response.json(
      toLabourAttendanceMonthResponse(
        month,
        labourFinancial(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
