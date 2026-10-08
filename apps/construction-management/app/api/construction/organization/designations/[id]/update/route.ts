import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";

import { toDesignationResponse } from "../../designation-response-model";
import { ConstructionOrganizationDesignationParamsModel } from "../designation-params-model";
import { UpdateConstructionOrganizationDesignationRequestModel } from "./update-designation-request-model";

export const dynamic = "force-dynamic";

const handlers = createDesignationHandlers();

/** Renames a Designation and replaces its Permission Template (CM-112). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.designations",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationDesignationParamsModel.safeParse(
        await context.params,
      ),
    );
    const model = parseOrThrow(
      UpdateConstructionOrganizationDesignationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      name: model.name,
      template: model.template,
      by: session.userId,
    });
    return Response.json(toDesignationResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
