import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  labourAttendanceHandlers as handlers,
  labourFinancial,
} from "../handlers";
import {
  GetConstructionLabourLabourAttendanceSheetRequestModel,
  toLabourAttendanceSheetResponse,
} from "../labour-attendance-models";

export const dynamic = "force-dynamic";

/**
 * The marking sheet for a Project and date (CM-211): active labourers on the
 * Project that day with their category, Supervisor, weekly holidays, wage
 * type, the day's row and a pre-fill hint. Needs Attendance read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionLabourLabourAttendanceSheetRequestModel.safeParse(
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
