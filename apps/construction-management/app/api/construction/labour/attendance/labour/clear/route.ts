import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf, labourAttendanceHandlers as handlers } from "../handlers";
import {
  ClearConstructionLabourEmployeeAttendanceRequestModel,
  expectedDates,
} from "../labour-attendance-models";

export const dynamic = "force-dynamic";

/**
 * Clears Employees' marked day on a Project: rows tombstoned and
 * ledger entries reversed, all or none. Needs Attendance delete; the
 * back-dated edit limit applies.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ClearConstructionLabourEmployeeAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      "labour.attendance",
      "delete",
      {
        projectId: model.projectId,
      },
    );
    if (isResponse(session)) return session;
    await handlers.clearDay({
      actor: actorOf(session),
      projectId: model.projectId,
      date: model.date,
      employeeIds: model.employeeIds,
      expected: expectedDates(model.expected),
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
