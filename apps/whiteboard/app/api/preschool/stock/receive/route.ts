import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { stock } from "../_stock";
import { ReceivePreschoolStockRequestModel } from "../stock-models";

export const dynamic = "force-dynamic";

/** Stock received at a Centre, several items on one bill. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      ReceivePreschoolStockRequestModel.safeParse(await request.json()),
    );
    return Response.json(await stock.stock.receive(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
