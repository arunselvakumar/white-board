import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { requirePreschoolManager } from "../_lib/session";
import { searchParams, stock } from "./_stock";
import { ListPreschoolStockRequestModel } from "./stock-models";

export const dynamic = "force-dynamic";

/** Every Stock Item with its stock on hand at the Centre. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolStockRequestModel.safeParse(
        searchParams(request, ["centreId", "category", "lowOnly"]),
      ),
    );
    return Response.json(
      await stock.stock.onHand(actor, {
        centreId: query.centreId,
        ...(query.category == null ? {} : { category: query.category }),
        lowOnly: query.lowOnly === "true",
      }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
