import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  BOQ_MENU,
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "../boq-access";
import {
  ListConstructionContractsBoqLibraryItemsRequestModel,
  toLibraryItemResponse,
  type ListConstructionContractsBoqLibraryItemsResponseModel,
} from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * Item Library Items for the BOQ item form (CM-1103), in code order, by
 * code or description, at most 25. The adopted rate is the suggested rate,
 * sent only with BOQ Financial. Needs BOQ create or update on the Project
 * (not Item Library read).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireBoqProjectAccess(
      request,
      ["create", "update"],
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsBoqLibraryItemsRequestModel.safeParse(raw),
    );
    const financial = can(session.access, BOQ_MENU, "financial", { projectId });
    const rows = await boqHandlers.libraryOptions(
      session.access,
      projectId,
      model.q,
    );
    const body: ListConstructionContractsBoqLibraryItemsResponseModel = {
      items: rows.map((row) => toLibraryItemResponse(row, financial)),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
