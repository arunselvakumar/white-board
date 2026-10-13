import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

import { UpdateTrainingInstituteReportSettingsRequestModel } from "../../report-models";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/** Owner only. Changes apply to every report straight away, past periods too. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    const body = parseOrThrow(
      UpdateTrainingInstituteReportSettingsRequestModel.safeParse(
        await request.json(),
      ),
    );
    return Response.json(await handlers.updateSettings(session, body));
  } catch (error) {
    return mapError(error);
  }
}
