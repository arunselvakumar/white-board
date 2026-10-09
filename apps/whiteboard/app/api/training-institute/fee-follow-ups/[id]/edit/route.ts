import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createFeeDuesHandlers } from "@/src/training-institute/infrastructure/create-fee-dues-handlers";

import {
  EditTrainingInstituteFeeFollowUpRequestModel,
  type IdContext,
  TrainingInstituteFeeFollowUpParamsModel,
} from "../../../fee-dues/fee-dues-models";

const handlers = createFeeDuesHandlers();

/** Owner only: change the open Fee Follow-up's channel, note, or next date. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteFeeFollowUpParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      EditTrainingInstituteFeeFollowUpRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.commands.edit(session, id, body));
  } catch (error) {
    return mapError(error);
  }
}
