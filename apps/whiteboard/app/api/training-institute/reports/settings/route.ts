import { mapError } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/** Owner only: the low-attendance and academic-year settings (§6.11). */
export async function GET(): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    return Response.json(await handlers.settings(session));
  } catch (error) {
    return mapError(error);
  }
}
