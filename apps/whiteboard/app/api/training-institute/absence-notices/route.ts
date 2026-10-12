import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireFamilySession } from "@/app/api/_lib/require-family-session";
import { createAbsenceNoticeHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import {
  GiveTrainingInstituteAbsenceNoticeRequestModel,
  type GiveTrainingInstituteAbsenceNoticeResponseModel,
  type TrainingInstituteFamilyAbsenceNoticesResponseModel,
} from "./absence-notice-models";

export const dynamic = "force-dynamic";

const handlers = createAbsenceNoticeHandlers();

/** The Student's, or each linked child's, notices for Classes not yet started. */
export async function GET(): Promise<Response> {
  try {
    const family = await requireFamilySession();
    if (family instanceof Response) return family;
    const body: TrainingInstituteFamilyAbsenceNoticesResponseModel =
      await handlers.list(family);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Give notice for one or more upcoming Classes of one Student. */
export async function POST(request: Request): Promise<Response> {
  try {
    const family = await requireFamilySession();
    if (family instanceof Response) return family;
    const input = parseOrThrow(
      GiveTrainingInstituteAbsenceNoticeRequestModel.safeParse(
        await request.json(),
      ),
    );
    const body: GiveTrainingInstituteAbsenceNoticeResponseModel =
      await handlers.give(family, input);
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
