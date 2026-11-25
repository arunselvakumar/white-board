import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolOwner,
  type IdContext,
} from "../../../../_lib/session";
import { fees } from "../../../_fees";
import {
  PreschoolFeeHeadDetailsRequestModel,
  PreschoolIdParamsModel,
} from "../../../fee-models";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolIdParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      PreschoolFeeHeadDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await fees.heads.updateDetails(actor, id, {
        name: model.name,
        kind: model.kind,
        royaltyBearing: model.royaltyBearing ?? false,
        refundable: model.refundable ?? false,
      }),
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
