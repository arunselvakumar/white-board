import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";

import { toDesignationResponse } from "../../designation-response-model";
import { ConstructionOrganizationDesignationParamsModel } from "../designation-params-model";
import { DuplicateConstructionOrganizationDesignationRequestModel } from "./duplicate-designation-request-model";

export const dynamic = "force-dynamic";

const handlers = createDesignationHandlers();

/** Copies a Designation with its template as a new one (CM-112). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.designations",
      "create",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationDesignationParamsModel.safeParse(
        await context.params,
      ),
    );
    // The body is optional: no body copies as "<name> (copy)".
    const text = await request.text();
    const model = parseOrThrow(
      DuplicateConstructionOrganizationDesignationRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    const copy = await handlers.duplicate({
      workspaceId: session.workspaceId,
      id,
      name: model.name,
      by: session.userId,
    });
    return Response.json(toDesignationResponse(copy), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
