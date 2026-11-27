import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { ConstructionProjectsProjectParamsModel } from "../../../../project-models";
import { projectLabours } from "../handlers";
import {
  ListConstructionProjectsProjectLabourOptionsRequestModel,
  toProjectLabourOptionsResponse,
} from "../project-labours-models";

export const dynamic = "force-dynamic";

/**
 * Active Labours not on the Project, by name, for Add Labours. Project
 * menu Update and Labours Read (the register's names and Labour Ids).
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
      ListConstructionProjectsProjectLabourOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(
      toProjectLabourOptionsResponse(
        await projectLabours.options(session.access, id, {
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
