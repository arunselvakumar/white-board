import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { BOQ_MENU, boqHandlers } from "../../boq-access";
import {
  toSettingsResponse,
  UpdateConstructionContractsBoqSettingsRequestModel,
} from "../../boq-models";

export const dynamic = "force-dynamic";

/**
 * Changes the Company's deviation limit (CM-1103): 0–100 % with two
 * places. Needs BOQ Update, checked Company-wide (the flag, not a Project).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, BOQ_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionContractsBoqSettingsRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(
      toSettingsResponse(
        await boqHandlers.updateSettings(session.access, model),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
