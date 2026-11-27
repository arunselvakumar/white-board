import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  EMPLOYEES_MENU,
  EmployeeIdParamsModel,
  toEmployeeResponse,
} from "../employee-models";
import { employeeSignIns } from "../handlers";

export const dynamic = "force-dynamic";

/** One Employee of the Active Company, with how they sign in. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      EmployeeIdParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toEmployeeResponse(
        await employeeSignIns.get(session.workspaceId, id),
        session.access,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
