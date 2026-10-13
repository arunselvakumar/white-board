import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

import { SaveTrainingInstituteReportRemarkRequestModel } from "../report-models";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/**
 * The Owner, or a Teacher of one of the Student's Batches, sets their one
 * remark on a Student's monthly report (R18). Blank text removes it.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    const body = parseOrThrow(
      SaveTrainingInstituteReportRemarkRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.saveRemark(session, body);
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
