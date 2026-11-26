import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolManager,
  type IdContext,
} from "../../../../_lib/session";
import { fees } from "../../../_fees";
import {
  PreschoolIdParamsModel,
  PreschoolInvoiceConcessionRequestModel,
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
      PreschoolInvoiceConcessionRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await fees.accounts.giveConcession(actor, id, {
        concessionPaise: model.concessionPaise,
        reason: model.reason ?? null,
      }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
