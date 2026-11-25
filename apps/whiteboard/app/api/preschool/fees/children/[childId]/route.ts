import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { fees, requireFeeReader, type ChildIdContext } from "../../_fees";
import { PreschoolChildIdParamsModel } from "../../fee-models";

export const dynamic = "force-dynamic";

/** A Child's Invoices, Fee Payments and totals. A Parent may read their own Child's. */
export async function GET(
  _request: Request,
  context: ChildIdContext,
): Promise<Response> {
  try {
    const actor = await requireFeeReader();
    if (actor instanceof Response) return actor;
    const { childId } = parseOrThrow(
      PreschoolChildIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await fees.accounts.account(actor, childId));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
