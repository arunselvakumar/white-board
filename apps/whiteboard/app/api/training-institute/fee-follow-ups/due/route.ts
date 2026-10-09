import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createFeeDuesHandlers } from "@/src/training-institute/infrastructure/create-fee-dues-handlers";

export const dynamic = "force-dynamic";

const handlers = createFeeDuesHandlers();

/** Owner only: open Fee Follow-ups due today or overdue. */
export async function GET(): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    return Response.json({
      items: await handlers.queries.followUpsDue(session),
    });
  } catch (error) {
    return mapError(error);
  }
}
