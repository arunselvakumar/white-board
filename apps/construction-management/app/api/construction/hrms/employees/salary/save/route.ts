import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createEmployeeSalaryHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";
import { can } from "@/src/shared-kernel/access";

import {
  SaveConstructionHrmsEmployeeSalariesRequestModel,
  toEmployeeSalaryRow,
  type SaveConstructionHrmsEmployeeSalariesResponseModel,
} from "../employee-salary-models";

export const dynamic = "force-dynamic";

const handlers = createEmployeeSalaryHandlers();

/**
 * Save All (CM-315): the changed rows in one transaction, all or none. A
 * Not Set member needs Employee Management create, a configured one
 * update, and amounts need financial. A row someone else saved meanwhile
 * is 409 `EMPLOYEE_SALARY_CHANGED` with `details.memberIds`; any other
 * row error names `details.memberId`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      SaveConstructionHrmsEmployeeSalariesRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      "hrms.employees",
      model.rows.some((row) => row.expectedUpdatedAt != null)
        ? "update"
        : "create",
    );
    if (isResponse(session)) return session;
    const financial = can(session.access, "hrms.employees", "financial");
    const saved = await handlers.save({
      access: session.access,
      rows: model.rows.map((row) => ({
        ...row,
        expectedUpdatedAt:
          row.expectedUpdatedAt == null
            ? null
            : new Date(row.expectedUpdatedAt),
      })),
      canCreate: can(session.access, "hrms.employees", "create"),
      canEdit: can(session.access, "hrms.employees", "update"),
      canFinancial: financial,
    });
    const body: SaveConstructionHrmsEmployeeSalariesResponseModel = {
      items: saved.map((row) => toEmployeeSalaryRow(row, financial)),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
