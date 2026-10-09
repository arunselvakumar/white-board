import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  vendorAttendanceHandlers as handlers,
  vendorFinancial,
} from "../handlers";
import {
  RecordConstructionLabourVendorAttendanceRequestModel,
  toVendorAttendanceDayResponse,
} from "../vendor-attendance-models";

export const dynamic = "force-dynamic";

/**
 * Records a vendor's day on a Project (CM-212): one line per shift and
 * category, priced from the vendor's current rate card and posted to the
 * vendor ledger. A new day needs Attendance create; changing a recorded day
 * (`expectedUpdatedAt`) needs Attendance update, and reverses and reposts
 * the day's ledger entry. The back-dated guard is `vendor_attendance`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RecordConstructionLabourVendorAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const editing = model.expectedUpdatedAt != null;
    const session = await requireAccess(
      request,
      "labour.attendance",
      editing ? "update" : "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const day = await handlers.record({
      actor: {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      },
      projectId: model.projectId,
      vendorId: model.vendorId,
      date: model.date,
      lines: model.lines,
      expectedUpdatedAt: editing
        ? new Date(model.expectedUpdatedAt ?? "")
        : null,
      canEdit: can(session.access, "labour.attendance", "update", {
        projectId: model.projectId,
      }),
    });
    return Response.json(
      toVendorAttendanceDayResponse(
        day,
        vendorFinancial(session.access, model.projectId),
      ),
      { status: editing ? StatusCodes.OK : StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
