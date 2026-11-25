import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import { requirePreschoolManager } from "../../../../_lib/session";
import { fees, type ChildIdContext } from "../../../_fees";
import { PreschoolChildIdParamsModel } from "../../../fee-models";

export const dynamic = "force-dynamic";

/** Raises the active Admission's Invoices from the Fee Structure in force. */
export async function POST(
  _request: Request,
  context: ChildIdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { childId } = parseOrThrow(
      PreschoolChildIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await fees.accounts.generate(actor, childId), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
