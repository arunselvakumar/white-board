import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolOwner,
  type IdContext,
} from "../../../../_lib/session";
import { stock } from "../../../_stock";
import { PreschoolStockIdParamsModel } from "../../../stock-models";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolStockIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await stock.items.restore(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
