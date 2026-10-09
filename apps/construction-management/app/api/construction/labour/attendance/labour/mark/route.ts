import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  actorOf,
  labourAttendanceHandlers as handlers,
  labourFinancial,
} from "../handlers";
import {
  expectedDates,
  MarkConstructionLabourLabourAttendanceRequestModel,
  toLabourAttendanceDayResponse,
  type MarkConstructionLabourLabourAttendanceResponseModel,
} from "../labour-attendance-models";

export const dynamic = "force-dynamic";

/**
 * Marks many labourers' day on a Project in one transaction (CM-210): each
 * day priced from the labourer's current wages and posted to the labour
 * ledger. A new day needs Attendance create; re-marking a day (its
 * `updatedAt` in `expected`) needs Attendance update and reverses and
 * reposts its entries. Back-dated guard `labour_attendance`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      MarkConstructionLabourLabourAttendanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const expected = expectedDates(model.expected);
    const scope = { projectId: model.projectId };
    const session = await requireAccess(
      request,
      "labour.attendance",
      Object.keys(expected).length > 0 ? "update" : "create",
      scope,
    );
    if (isResponse(session)) return session;
    const saved = await handlers.markDay({
      actor: actorOf(session),
      projectId: model.projectId,
      date: model.date,
      marks: model.marks,
      expected,
      canCreate: can(session.access, "labour.attendance", "create", scope),
      canEdit: can(session.access, "labour.attendance", "update", scope),
    });
    const financial = labourFinancial(session.access, model.projectId);
    const body: MarkConstructionLabourLabourAttendanceResponseModel = {
      items: saved.map((day) => toLabourAttendanceDayResponse(day, financial)),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
