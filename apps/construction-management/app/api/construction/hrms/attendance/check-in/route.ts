import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CheckInConstructionHrmsAttendanceRequestModel,
  toEntryResponse,
} from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Check In with the device location (CM-308, ADR CM-0012 §1): refused
 * outside every fence when GPS is required, sent to approvals under
 * `record_only`; one open entry at a time.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "create");
    if (isResponse(session)) return session;
    const location = parseOrThrow(
      CheckInConstructionHrmsAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const entry = await attendance.checkIn({
      access: session.access,
      location,
    });
    return Response.json(toEntryResponse(entry), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
