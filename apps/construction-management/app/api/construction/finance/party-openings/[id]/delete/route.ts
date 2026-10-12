import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance, requireDocumentAccess } from "../../../parties/handlers";
import { ConstructionFinancePartyIdParamsModel } from "../../../parties/party-shared-models";
import { DeleteConstructionFinancePartyOpeningRequestModel } from "../../party-opening-models";

export const dynamic = "force-dynamic";

/** Removes an opening balance, reversing its entry (Parties delete). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireDocumentAccess(request, "delete", (ws) =>
      finance.openings.find(ws, id),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionFinancePartyOpeningRequestModel.safeParse(
        await request.json(),
      ),
    );
    await finance.openings.remove(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
