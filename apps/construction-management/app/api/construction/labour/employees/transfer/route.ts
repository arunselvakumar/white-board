import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  TransferConstructionLabourEmployeesRequestModel,
  toEmployeeResponse,
} from "../employee-models";
import { employeeSignIns } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Transfers one or many Employees from a Project to another from a date;
 * their other Projects stay (ADR CM-0033), and their sign-ins follow.
 * Needs `transfer` on Employees (`labour.labour`) for the destination and
 * for every source Project. All or none.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const model = parseOrThrow(
      TransferConstructionLabourEmployeesRequestModel.safeParse(raw),
    );
    const session = await requireAccess(request, "labour.labour", "transfer", {
      projectId: model.toProjectId,
    });
    if (isResponse(session)) return session;
    const items = await employeeSignIns.transfer({
      workspaceId: session.workspaceId,
      access: session.access,
      employeeIds: model.employeeIds,
      fromProjectId: model.fromProjectId,
      toProjectId: model.toProjectId,
      transferDate: model.transferDate,
      remark: model.remark,
      by: session.userId,
    });
    return Response.json({
      items: items.map((item) => toEmployeeResponse(item, session.access)),
    });
  } catch (error) {
    return mapError(error);
  }
}
