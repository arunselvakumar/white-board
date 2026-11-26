import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolManager,
  type IdContext,
} from "../../../../_lib/session";
import { fees } from "../../../_fees";
import {
  CancelPreschoolFeePaymentRequestModel,
  PreschoolIdParamsModel,
} from "../../../fee-models";

export const dynamic = "force-dynamic";

/** Cancels a Receipt entered by mistake; it keeps its number but counts for nothing. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolIdParamsModel.safeParse(await context.params),
    );
    const { reason } = parseOrThrow(
      CancelPreschoolFeePaymentRequestModel.safeParse(await request.json()),
    );
    return Response.json(await fees.payments.cancel(actor, id, { reason }));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
