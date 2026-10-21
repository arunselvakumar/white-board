import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";
import {
  CreateConstructionContractsBoqSectionRequestModel,
  toSectionSummaryResponse,
} from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * Adds a section at the end of the Project's BOQ (CM-1103); 409
 * BOQ_SECTION_TITLE_TAKEN when a live one has the title, ignoring case.
 * Needs BOQ create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireBoqProjectAccess(request, "create", projectId);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionContractsBoqSectionRequestModel.safeParse(body),
    );
    const section = await boqHandlers.createSection(
      session.access,
      projectId,
      model.title,
    );
    return Response.json(toSectionSummaryResponse(section), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
