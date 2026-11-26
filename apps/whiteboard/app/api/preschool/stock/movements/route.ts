import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { searchParams, stock } from "../_stock";
import { ListPreschoolStockMovementsRequestModel } from "../stock-models";

export const dynamic = "force-dynamic";

/** A Centre's Stock Movements, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolStockMovementsRequestModel.safeParse(
        searchParams(request, [
          "centreId",
          "itemId",
          "childId",
          "kind",
          "from",
          "to",
          "limit",
          "cursor",
        ]),
      ),
    );
    return Response.json(await stock.stock.ledger(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
