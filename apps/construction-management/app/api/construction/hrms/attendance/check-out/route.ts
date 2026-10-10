import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CheckOutConstructionHrmsAttendanceRequestModel,
  toEntryResponse,
} from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/** Check Out: closes today's open entry (or last night's shift) (CM-308). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "create");
    if (isResponse(session)) return session;
    const location = parseOrThrow(
      CheckOutConstructionHrmsAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const entry = await attendance.checkOut({
      access: session.access,
      location,
    });
    return Response.json(toEntryResponse(entry));
  } catch (error) {
    return mapError(error);
  }
}
