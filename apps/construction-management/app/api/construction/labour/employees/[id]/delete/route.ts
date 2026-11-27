import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { EMPLOYEES_MENU, EmployeeIdParamsModel } from "../../employee-models";
import { employeeSignIns } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes (hides) an Employee and removes their sign-in. 409
 * `EMPLOYEE_HAS_RECORDS` once they have attendance or payments; mark them
 * Inactive instead.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      EmployeeIdParamsModel.safeParse(await context.params),
    );
    await employeeSignIns.delete({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
