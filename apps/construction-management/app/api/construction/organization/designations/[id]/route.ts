import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";

import { toDesignationResponse } from "../designation-response-model";
import { ConstructionOrganizationDesignationParamsModel } from "./designation-params-model";

export const dynamic = "force-dynamic";

const handlers = createDesignationHandlers();

/** One Designation of the Active Company, with its template (CM-112). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.designations",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationDesignationParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(
      toDesignationResponse(await handlers.get(session.workspaceId, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
