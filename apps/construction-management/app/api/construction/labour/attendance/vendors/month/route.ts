import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  vendorAttendanceHandlers as handlers,
  vendorFinancial,
} from "../handlers";
import {
  GetConstructionLabourVendorAttendanceMonthRequestModel,
  toVendorAttendanceMonthResponse,
} from "../vendor-attendance-models";

export const dynamic = "force-dynamic";

/**
 * The month view (CM-213): vendor × day matrix of full, half and overtime
 * with pay per day, and totals per vendor, per Labour Category and per day.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionLabourVendorAttendanceMonthRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
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
      toVendorAttendanceMonthResponse(
        month,
        vendorFinancial(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
