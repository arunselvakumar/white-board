import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ApproveConstructionHrmsAttendanceRequestModel,
  HrmsAttendanceIdParamsModel,
  toEntryResponse,
} from "../../../attendance-models";
import { attendance } from "../../../handlers";

export const dynamic = "force-dynamic";

/** Approves a pending entry; never one's own unless the Owner (CM-308). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "approve");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsAttendanceIdParamsModel.safeParse(await context.params),
    );
    const { expectedUpdatedAt } = parseOrThrow(
      ApproveConstructionHrmsAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const entry = await attendance.approve({
      access: session.access,
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toEntryResponse(entry));
  } catch (error) {
    return mapError(error);
  }
}
