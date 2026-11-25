import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import {
  requirePreschoolOwner,
  requirePreschoolStaff,
} from "../../_lib/session";
import { searchParams, stock } from "../_stock";
import {
  ListPreschoolStockItemsRequestModel,
  PreschoolStockItemDetailsRequestModel,
} from "../stock-models";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolStockItemsRequestModel.safeParse(
        searchParams(request, ["includeArchived"]),
      ),
    );
    return Response.json(
      await stock.items.list(actor, {
        includeArchived: query.includeArchived === "true",
      }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const model = parseOrThrow(
      PreschoolStockItemDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await stock.items.create(actor, {
        ...model,
        reorderLevel: model.reorderLevel ?? null,
      }),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
