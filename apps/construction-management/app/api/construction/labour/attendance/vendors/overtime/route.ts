import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  vendorAttendanceHandlers as handlers,
  vendorFinancial,
} from "../handlers";
import {
  GetConstructionLabourVendorAttendanceOvertimeRequestModel,
  toVendorAttendanceOvertimeResponse,
} from "../vendor-attendance-models";

export const dynamic = "force-dynamic";

/** Vendor attendance lines with overtime in a date range (CM-213). */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionLabourVendorAttendanceOvertimeRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const view = await handlers.overtime(
      session.workspaceId,
      model.projectId,
      model.from,
      model.to,
    );
    return Response.json(
      toVendorAttendanceOvertimeResponse(
        view,
        vendorFinancial(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
