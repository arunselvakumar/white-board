import { StatusCodes } from "http-status-codes";

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
  CreateConstructionContractsBoqItemRequestModel,
  toBoqItemResponse,
} from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * Adds a BOQ item (CM-1103), typed or filled from the Item Library
 * (`libraryItemId`, locked so it cannot be deleted in between). Its
 * original quantity and rate are the ones given. 409 BOQ_ITEM_NO_TAKEN.
 * Needs BOQ create; the rate needs Financial.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireBoqProjectAccess(request, "create", projectId);
    if (isResponse(session)) return session;
    const { projectId: _projectId, ...input } = parseOrThrow(
      CreateConstructionContractsBoqItemRequestModel.safeParse(body),
    );
    const item = await boqHandlers.createItem(session.access, projectId, input);
    return Response.json(
      toBoqItemResponse(
        item,
        can(session.access, BOQ_MENU, "financial", { projectId }),
      ),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
