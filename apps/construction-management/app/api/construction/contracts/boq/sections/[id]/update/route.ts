import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { boqHandlers, requireBoqRecordAccess } from "../../../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  toSectionSummaryResponse,
  UpdateConstructionContractsBoqSectionRequestModel,
} from "../../../boq-models";

export const dynamic = "force-dynamic";

/**
 * Renames a section (CM-1103) when it is still as loaded (409
 * BOQ_SECTION_CHANGED); 409 BOQ_SECTION_TITLE_TAKEN. Needs BOQ update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsBoqParamsModel.safeParse(await context.params),
    );
    const session = await requireBoqRecordAccess(request, "update", (ws) =>
      boqHandlers.findSection(ws, id),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionContractsBoqSectionRequestModel.safeParse(
        await request.json(),
      ),
    );
    const section = await boqHandlers.renameSection(
      session.access,
      id,
      model.title,
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toSectionSummaryResponse(section));
  } catch (error) {
    return mapError(error);
  }
}
