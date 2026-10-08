import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createDesignationHandlers } from "@/src/organization/infrastructure/create-designation-handlers";

import { CreateConstructionOrganizationDesignationRequestModel } from "./create-designation-request-model";
import { toDesignationResponse } from "./designation-response-model";
import type { ListConstructionOrganizationDesignationsResponseModel } from "./list-designations-response-model";

export const dynamic = "force-dynamic";

const handlers = createDesignationHandlers();

/**
 * Every live Designation of the Active Company, by name (CM-112). A Company
 * has a few dozen, so the list is not paged.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.designations",
      "read",
    );
    if (isResponse(session)) return session;
    const items = await handlers.list(session.workspaceId);
    const body: ListConstructionOrganizationDesignationsResponseModel = {
      items: items.map(toDesignationResponse),
      total: items.length,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a Designation, optionally with a Permission Template (CM-112). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.designations",
      "create",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationDesignationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      name: model.name,
      template: model.template,
      by: session.userId,
    });
    return Response.json(toDesignationResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
