import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  OTHER_PARTY_MENU,
  otherPartyHandlers as handlers,
} from "../../handlers";
import {
  ConstructionFinanceOtherPartyParamsModel,
  DeleteConstructionFinanceOtherPartyRequestModel,
} from "../../other-party-models";

export const dynamic = "force-dynamic";

/**
 * Deletes an Other Party (CM-704): refused with 409 OTHER_PARTY_IN_USE
 * while any invoice, party payment, opening balance or party entry names
 * it. Paid To labels on Transactions and vouchers keep their own copy of
 * the name and do not block.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, OTHER_PARTY_MENU, "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionFinanceOtherPartyParamsModel.safeParse(await context.params),
    );
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionFinanceOtherPartyRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      model.expectedUpdatedAt == null
        ? null
        : new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
