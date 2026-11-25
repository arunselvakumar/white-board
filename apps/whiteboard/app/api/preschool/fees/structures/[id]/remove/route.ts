import { StatusCodes } from "http-status-codes";

import { mapPreschoolError, parseOrThrow } from "../../../../_lib/map-error";
import {
  requirePreschoolManager,
  type IdContext,
} from "../../../../_lib/session";
import { fees } from "../../../_fees";
import { PreschoolIdParamsModel } from "../../../fee-models";

export const dynamic = "force-dynamic";

/** Removes a Centre's own amounts; the default applies again. */
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
    await fees.structures.remove(actor, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
