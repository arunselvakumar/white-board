import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolManager,
  type IdContext,
} from "../../../../_lib/session";
import { fees } from "../../../_fees";
import { PreschoolIdParamsModel } from "../../../fee-models";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolIdParamsModel.safeParse(await context.params),
    );
    return Response.json(await fees.accounts.cancelInvoice(actor, id));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
