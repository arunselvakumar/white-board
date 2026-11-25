import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolManager,
  type IdContext,
} from "../../../../_lib/session";
import { fees } from "../../../_fees";
import {
  PreschoolIdParamsModel,
  UpdatePreschoolInvoiceRequestModel,
} from "../../../fee-models";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolIdParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdatePreschoolInvoiceRequestModel.safeParse(await request.json()),
    );
    return Response.json(await fees.accounts.updateInvoice(actor, id, model));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
