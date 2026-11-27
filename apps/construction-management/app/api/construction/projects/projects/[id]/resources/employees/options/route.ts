import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { ConstructionProjectsProjectParamsModel } from "../../../../project-models";
import { projectEmployees } from "../handlers";
import {
  ListConstructionProjectsProjectEmployeeOptionsRequestModel,
  toProjectEmployeeOptionsResponse,
} from "../project-employees-models";

export const dynamic = "force-dynamic";

/**
 * Active Employees not on the Project, by name, for Add Employees.
 * Project menu Update and Employees Read (their names and Employee Ids).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    if (!can(session.access, "masters.labours", "read"))
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      );
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      ListConstructionProjectsProjectEmployeeOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(
      toProjectEmployeeOptionsResponse(
        await projectEmployees.options(session.access, id, {
          limit: model.limit,
          ...(model.search == null || model.search === ""
            ? {}
            : { search: model.search }),
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
