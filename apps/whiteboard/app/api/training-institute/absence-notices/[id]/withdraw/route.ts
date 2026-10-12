import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireFamilySession } from "@/app/api/_lib/require-family-session";
import { createAbsenceNoticeHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import {
  TrainingInstituteAbsenceNoticeIdParamsModel,
  type TrainingInstituteFamilyAbsenceNoticeModel,
} from "../../absence-notice-models";

export const dynamic = "force-dynamic";

const handlers = createAbsenceNoticeHandlers();

/** Withdraw a notice before its Class starts, as the Student or a linked Parent. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const family = await requireFamilySession();
    if (family instanceof Response) return family;
    const { id } = parseOrThrow(
      TrainingInstituteAbsenceNoticeIdParamsModel.safeParse(
        await context.params,
      ),
    );
    const body: TrainingInstituteFamilyAbsenceNoticeModel =
      await handlers.withdraw(family, id);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
