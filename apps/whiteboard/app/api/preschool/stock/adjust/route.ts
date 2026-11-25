import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { stock } from "../_stock";
import { AdjustPreschoolStockRequestModel } from "../stock-models";

export const dynamic = "force-dynamic";

/** A count correction, damage or loss, with the reason. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      AdjustPreschoolStockRequestModel.safeParse(await request.json()),
    );
    return Response.json(await stock.stock.adjust(actor, model), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
