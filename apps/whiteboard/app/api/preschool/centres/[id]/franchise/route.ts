import { createCentreHandlers } from "@/src/preschool/infrastructure/create-centre-handlers";

import { mapPreschoolError, parseOrThrow } from "../../../_lib/map-error";
import { requirePreschoolManager, type IdContext } from "../../../_lib/session";
import {
  PreschoolCentreParamsModel,
  UpdatePreschoolCentreFranchiseRequestModel,
} from "../../centres-models";

export const dynamic = "force-dynamic";

const handlers = createCentreHandlers();

/** Changes how a Centre is owned: franchisee, agreement and royalty (Owner). */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      PreschoolCentreParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdatePreschoolCentreFranchiseRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.updateFranchise(actor, id, model));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
