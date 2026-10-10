import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "../shift-templates/handlers";
import {
  CreateConstructionHrmsRotationTemplateRequestModel,
  toRotationResponse,
  type ListConstructionHrmsRotationTemplatesResponseModel,
} from "../shift-templates/shift-models";

export const dynamic = "force-dynamic";

/** Every rotation template, by name (CM-306). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "read");
    if (isResponse(session)) return session;
    const items = await templates.listRotations({ access: session.access });
    const body: ListConstructionHrmsRotationTemplatesResponseModel = {
      items: items.map(toRotationResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a rotation template; each slot an active shift or a Week Off (CM-306). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsRotationTemplateRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await templates.createRotation({
      access: session.access,
      template: model,
    });
    return Response.json(toRotationResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
