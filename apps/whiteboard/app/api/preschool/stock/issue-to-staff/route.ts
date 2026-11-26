import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { stock } from "../_stock";
import { IssuePreschoolStockToStaffRequestModel } from "../stock-models";

export const dynamic = "force-dynamic";

/** Stock handed to a Staff member of the Centre. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      IssuePreschoolStockToStaffRequestModel.safeParse(await request.json()),
    );
    return Response.json(await stock.stock.issueToStaff(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
