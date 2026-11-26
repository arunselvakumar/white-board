import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import type { IdContext } from "../../../_lib/session";
import { fees, requireFeeReader } from "../../_fees";
import { PreschoolIdParamsModel } from "../../fee-models";

export const dynamic = "force-dynamic";

/** The Receipt. A Parent may read their own Child's. */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requireFeeReader();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await fees.payments.receipt(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
