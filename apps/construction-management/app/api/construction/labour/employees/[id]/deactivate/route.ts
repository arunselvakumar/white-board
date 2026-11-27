import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  EMPLOYEES_MENU,
  EmployeeIdParamsModel,
  toEmployeeResponse,
} from "../../employee-models";
import { employee, employeeSignIns } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Marks an Employee Inactive: they leave attendance pickers and cannot be
 * picked for new work; their records and sign-in stay.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      EmployeeIdParamsModel.safeParse(await context.params),
    );
    const updated = await employee.employees.setActive({
      workspaceId: session.workspaceId,
      id,
      active: false,
      by: session.userId,
    });
    return Response.json(
      toEmployeeResponse(
        await employeeSignIns.withSignIn(session.workspaceId, updated),
        session.access,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
