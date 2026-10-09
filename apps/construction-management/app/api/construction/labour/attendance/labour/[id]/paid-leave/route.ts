import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  actorOf,
  labourAttendanceHandlers as handlers,
  labourFinancial,
} from "../../handlers";
import {
  ConstructionLabourLabourAttendanceParamsModel,
  SetConstructionLabourLabourAttendancePaidLeaveRequestModel,
  toLabourAttendanceDayResponse,
} from "../../labour-attendance-models";

export const dynamic = "force-dynamic";

/**
 * "Mark Paid Leave" (CM-210): toggles Paid Leave on an On Leave day and
 * reposts its ledger entries; the snapshot wage stays. Needs Attendance
 * update on the day's Project; the back-dated edit limit applies.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionLabourLabourAttendanceParamsModel.safeParse(
        await context.params,
      ),
    );
    const model = parseOrThrow(
      SetConstructionLabourLabourAttendancePaidLeaveRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "update");
    if (isResponse(session)) return session;
    const projectId = await handlers.projectOf(session.workspaceId, id);
    if (!can(session.access, "labour.attendance", "update", { projectId }))
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      );
    const day = await handlers.setPaidLeave({
      actor: actorOf(session),
      attendanceId: id,
      isPaidLeave: model.isPaidLeave,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(
      toLabourAttendanceDayResponse(
        day,
        labourFinancial(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
