import { mapError } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/** The reports the session's role may open, with their filters and formats. */
export async function GET(): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    // A deactivated Teacher gets no reports at all.
    await handlers.viewer(session);
    return Response.json({
      role: session.role,
      items: handlers.catalogue(session),
    });
  } catch (error) {
    return mapError(error);
  }
}
