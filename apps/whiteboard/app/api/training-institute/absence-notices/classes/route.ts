import { mapError } from "@/app/api/_lib/map-error";
import { requireFamilySession } from "@/app/api/_lib/require-family-session";
import { createAbsenceNoticeHandlers } from "@/src/training-institute/infrastructure/create-absence-notice-handlers";

import type { TrainingInstituteAbsenceNoticeClassesResponseModel } from "../absence-notice-models";

export const dynamic = "force-dynamic";

const handlers = createAbsenceNoticeHandlers();

/** The Class picker: each linked Student's Classes notice can be given for. */
export async function GET(): Promise<Response> {
  try {
    const family = await requireFamilySession();
    if (family instanceof Response) return family;
    const body: TrainingInstituteAbsenceNoticeClassesResponseModel =
      await handlers.classes(family);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
