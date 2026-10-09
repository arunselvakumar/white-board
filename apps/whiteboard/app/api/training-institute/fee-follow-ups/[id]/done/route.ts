import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createFeeDuesHandlers } from "@/src/training-institute/infrastructure/create-fee-dues-handlers";

import {
  type IdContext,
  TrainingInstituteFeeFollowUpParamsModel,
} from "../../../fee-dues/fee-dues-models";

const handlers = createFeeDuesHandlers();

/** Owner only: close the open Fee Follow-up without logging another. */
export async function POST(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteFeeFollowUpParamsModel.safeParse(await context.params),
    );
    return Response.json(await handlers.commands.markDone(session, id));
  } catch (error) {
    return mapError(error);
  }
}
