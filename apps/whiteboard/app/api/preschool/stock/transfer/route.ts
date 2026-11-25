import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolOwner } from "../../_lib/session";
import { stock } from "../_stock";
import { TransferPreschoolStockRequestModel } from "../stock-models";

export const dynamic = "force-dynamic";

/** Stock sent from one Centre to another (Owner only). */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      TransferPreschoolStockRequestModel.safeParse(await request.json()),
    );
    return Response.json(await stock.stock.transfer(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
