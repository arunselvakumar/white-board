import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  vendorAttendanceHandlers as handlers,
  vendorFinancial,
} from "./handlers";
import {
  ListConstructionLabourVendorAttendanceRequestModel,
  toVendorAttendanceDayResponse,
  type ListConstructionLabourVendorAttendanceResponseModel,
} from "./vendor-attendance-models";

export const dynamic = "force-dynamic";

/**
 * Recorded vendor days of a Project, newest first, filtered by vendor,
 * Labour Category and date range, a page at a time (CM-213).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionLabourVendorAttendanceRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      from: model.from,
      to: model.to,
      vendorId: model.vendorId,
      labourCategoryId: model.categoryId,
      page: model.page,
      pageSize: model.pageSize,
    });
    const financial = vendorFinancial(session.access, model.projectId);
    const body: ListConstructionLabourVendorAttendanceResponseModel = {
      items: page.items.map((item) =>
        toVendorAttendanceDayResponse(item, financial),
      ),
      total: page.total,
      page: model.page,
      pageSize: model.pageSize,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
