import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolOwner,
  type IdContext,
} from "../../../../_lib/session";
import { stock } from "../../../_stock";
import {
  PreschoolStockIdParamsModel,
  PreschoolStockItemDetailsRequestModel,
} from "../../../stock-models";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolStockIdParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      PreschoolStockItemDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await stock.items.updateDetails(actor, id, {
        ...model,
        reorderLevel: model.reorderLevel ?? null,
      }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
