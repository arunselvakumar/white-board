import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";

import { ConstructionOrganizationDesignationParamsModel } from "../designation-params-model";

export const dynamic = "force-dynamic";

const handlers = createDesignationHandlers();

/**
 * Deletes a Designation (CM-112). 409 `DESIGNATION_IN_USE` while a live
 * Team Member still holds it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.designations",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationDesignationParamsModel.safeParse(
        await context.params,
      ),
    );
    await handlers.delete({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
