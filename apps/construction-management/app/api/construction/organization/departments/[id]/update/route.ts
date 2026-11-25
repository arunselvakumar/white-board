import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionOrganizationDepartmentParamsModel,
  UpdateConstructionOrganizationDepartmentRequestModel,
  toDepartmentResponse,
} from "../../department-models";
import { departmentHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Renames a Company-made department (ADR CM-0049 §4). 400
 * `DEPARTMENT_SYSTEM_LOCKED`; 409 `STALE_DEPARTMENT`, `DEPARTMENT_NAME_TAKEN`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.departments",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationDepartmentParamsModel.safeParse(
        await context.params,
      ),
    );
    const model = parseOrThrow(
      UpdateConstructionOrganizationDepartmentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.rename({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      name: model.name,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(toDepartmentResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
