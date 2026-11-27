import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  EMPLOYEES_MENU,
  EmployeeIdParamsModel,
  UpdateConstructionLabourEmployeeRequestModel,
  employeeBankInput,
  toEmployeeResponse,
} from "../../employee-models";
import { employeeSignIns } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Edit Employee. A changed opening balance or joining date reverses the
 * old opening entry and posts the new one; their sign-in follows the Role,
 * name, mobile, email and Projects, and "Can sign in" turns it on or off
 * (ADR CM-0055 §4). 409 `EMPLOYEE_CHANGED` when someone saved since
 * `expectedUpdatedAt`.
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
    const { signIn, ...model } = parseOrThrow(
      UpdateConstructionLabourEmployeeRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await employeeSignIns.update({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      employee: {
        ...model,
        ...employeeBankInput(model, session.access),
        expectedUpdatedAt: new Date(model.expectedUpdatedAt),
      },
      signIn,
    });
    return Response.json(toEmployeeResponse(updated, session.access));
  } catch (error) {
    return mapError(error);
  }
}
