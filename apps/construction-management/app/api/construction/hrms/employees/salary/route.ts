import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createEmployeeSalaryHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";
import { can } from "@/src/shared-kernel/access";

import {
  toEmployeeSalaryRow,
  toStructureOption,
  type ListConstructionHrmsEmployeeSalariesResponseModel,
} from "./employee-salary-models";

export const dynamic = "force-dynamic";

const handlers = createEmployeeSalaryHandlers();

/**
 * Every Team Member (Normal and HRMS) with their salary configuration,
 * Configured or Not Set (CM-315). Amounts are null without financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.employees", "read");
    if (isResponse(session)) return session;
    const financial = can(session.access, "hrms.employees", "financial");
    const { rows, structures } = await handlers.list({
      access: session.access,
    });
    const body: ListConstructionHrmsEmployeeSalariesResponseModel = {
      items: rows.map((row) => toEmployeeSalaryRow(row, financial)),
      structures: structures.map(toStructureOption),
      financial,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
