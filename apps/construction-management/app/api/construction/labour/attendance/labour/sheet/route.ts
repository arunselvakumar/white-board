import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  labourAttendanceHandlers as handlers,
  labourFinancial,
} from "../handlers";
import {
  GetConstructionLabourEmployeeAttendanceSheetRequestModel,
  toLabourAttendanceSheetResponse,
} from "../labour-attendance-models";

export const dynamic = "force-dynamic";

/**
 * The marking sheet for a Project and date: every active Employee on the
 * Project that day, whatever their Role (ADR CM-0055), with their Labour
 * Category, Role, weekly holidays, wage type, the day's row and a pre-fill
 * hint. Needs Attendance read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionLabourEmployeeAttendanceSheetRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const sheet = await handlers.sheet(
      session.workspaceId,
      model.projectId,
      model.date,
    );
    return Response.json(
      toLabourAttendanceSheetResponse(
        sheet,
        labourFinancial(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
