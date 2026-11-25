import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { stock } from "../_stock";
import { IssuePreschoolStockToChildRequestModel } from "../stock-models";

export const dynamic = "force-dynamic";

/** Stock handed to a Child of the Centre. It does not bill. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      IssuePreschoolStockToChildRequestModel.safeParse(await request.json()),
    );
    return Response.json(await stock.stock.issueToChild(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
