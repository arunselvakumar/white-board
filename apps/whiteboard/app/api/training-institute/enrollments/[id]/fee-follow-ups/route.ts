import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createFeeDuesHandlers } from "@/src/training-institute/infrastructure/create-fee-dues-handlers";

import {
  type IdContext,
  LogTrainingInstituteFeeFollowUpRequestModel,
  TrainingInstituteFeeFollowUpEnrollmentParamsModel,
} from "../../../fee-dues/fee-dues-models";

export const dynamic = "force-dynamic";

const handlers = createFeeDuesHandlers();

/** Owner only: the Enrollment's Fee Follow-up history, newest first. */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteFeeFollowUpEnrollmentParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(await handlers.queries.history(session, id));
  } catch (error) {
    return mapError(error);
  }
}

/** Owner only: log a Fee Follow-up; the open one, if any, closes. */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TrainingInstituteFeeFollowUpEnrollmentParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      LogTrainingInstituteFeeFollowUpRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.commands.log(session, id, body), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
