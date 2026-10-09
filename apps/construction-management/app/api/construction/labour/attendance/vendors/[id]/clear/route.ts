import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { vendorAttendanceHandlers as handlers } from "../../handlers";
import {
  ClearConstructionLabourVendorAttendanceRequestModel,
  ConstructionLabourVendorAttendanceParamsModel,
} from "../../vendor-attendance-models";

export const dynamic = "force-dynamic";

/**
 * Clears a recorded vendor day (CM-212): the row is tombstoned and its
 * ledger entry reversed. Needs Attendance delete on the day's Project; the
 * back-dated edit limit applies.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionLabourVendorAttendanceParamsModel.safeParse(
        await context.params,
      ),
    );
    const text = await request.text();
    const model = parseOrThrow(
      ClearConstructionLabourVendorAttendanceRequestModel.safeParse(
        text.trim().length === 0 ? {} : JSON.parse(text),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "delete");
    if (isResponse(session)) return session;
    const projectId = await handlers.projectOf(session.workspaceId, id);
    if (!can(session.access, "labour.attendance", "delete", { projectId }))
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      );
    await handlers.clear({
      actor: {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      },
      id,
      expectedUpdatedAt:
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
