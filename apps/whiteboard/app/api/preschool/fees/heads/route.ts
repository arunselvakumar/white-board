import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import {
  requirePreschoolManager,
  requirePreschoolOwner,
} from "../../_lib/session";
import { fees, searchParams } from "../_fees";
import {
  ListPreschoolFeeHeadsRequestModel,
  PreschoolFeeHeadDetailsRequestModel,
} from "../fee-models";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      ListPreschoolFeeHeadsRequestModel.safeParse(
        searchParams(request, ["includeArchived"]),
      ),
    );
    return Response.json(
      await fees.heads.list(actor, {
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
      PreschoolFeeHeadDetailsRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      await fees.heads.create(actor, {
        name: model.name,
        kind: model.kind,
        royaltyBearing: model.royaltyBearing ?? false,
        refundable: model.refundable ?? false,
      }),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapPreschoolError(error);
  }
}
