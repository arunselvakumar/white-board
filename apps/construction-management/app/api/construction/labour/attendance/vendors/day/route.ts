import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  vendorAttendanceHandlers as handlers,
  vendorFinancial,
} from "../handlers";
import {
  GetConstructionLabourVendorAttendanceDayRequestModel,
  toVendorAttendanceGridResponse,
} from "../vendor-attendance-models";

export const dynamic = "force-dynamic";

/**
 * The vendor attendance grid for one Project and date (CM-213): every
 * active vendor on the Project with its rate card and that day's lines.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionLabourVendorAttendanceDayRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const grid = await handlers.day(
      session.workspaceId,
      model.projectId,
      model.date,
    );
    return Response.json(
      toVendorAttendanceGridResponse(
        grid,
        vendorFinancial(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
