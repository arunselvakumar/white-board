import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolActor } from "../../../_lib/session";
import { stock, type ChildIdContext } from "../../_stock";
import { PreschoolStockChildParamsModel } from "../../stock-models";

export const dynamic = "force-dynamic";

/** What a Child has been issued: books, uniform, kit. */
export async function GET(
  _request: Request,
  context: ChildIdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    const { childId } = parseOrThrow(
      PreschoolStockChildParamsModel.safeParse(await context.params),
    );
    return Response.json(await stock.stock.childIssued(actor, childId));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
