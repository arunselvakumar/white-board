import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { templates } from "./handlers";
import {
  CreateConstructionHrmsShiftTemplateRequestModel,
  toShiftResponse,
  type ListConstructionHrmsShiftTemplatesResponseModel,
} from "./shift-models";

export const dynamic = "force-dynamic";

/** Every shift template, by name (CM-306). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "read");
    if (isResponse(session)) return session;
    const items = await templates.listShifts({ access: session.access });
    const body: ListConstructionHrmsShiftTemplatesResponseModel = {
      items: items.map(toShiftResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a shift template (CM-306). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsShiftTemplateRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await templates.createShift({
      access: session.access,
      template: model,
    });
    return Response.json(toShiftResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
