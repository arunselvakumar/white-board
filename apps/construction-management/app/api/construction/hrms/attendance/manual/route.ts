import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionHrmsManualAttendanceRequestModel,
  toEntryResponse,
} from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Add Backdated Attendance: a past day's check-in and check-out; the
 * Back-dated Entry policy for HRMS → Attendance; it goes to approvals (CM-308).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      AddConstructionHrmsManualAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const entry = await attendance.addManual({
      access: session.access,
      ...model,
    });
    return Response.json(toEntryResponse(entry), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
