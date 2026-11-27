import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  EMPLOYEES_MENU,
  EmployeeIdParamsModel,
  SetConstructionLabourEmployeePasswordRequestModel,
  toEmployeeResponse,
} from "../../employee-models";
import { employeeSignIns } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * A new temporary password for the Employee's sign-in (ADR CM-0030 §7):
 * they must change it at their next sign-in. 409 `EMPLOYEE_NO_SIGN_IN`
 * when they do not sign in; 403 `CANNOT_GRANT` unless the caller holds
 * every cell of their Role, `OWN_ROLE` for their own.
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
    const { password } = parseOrThrow(
      SetConstructionLabourEmployeePasswordRequestModel.safeParse(
        await request.json(),
      ),
    );
    const item = await employeeSignIns.setPassword({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      password,
    });
    return Response.json({
      ...toEmployeeResponse(item, session.access),
      passwordIgnored: item.passwordIgnored,
    });
  } catch (error) {
    return mapError(error);
  }
}
