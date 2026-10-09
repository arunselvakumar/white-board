import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import { createFeeDuesHandlers } from "@/src/training-institute/infrastructure/create-fee-dues-handlers";

import { ListTrainingInstituteFeeDuesRequestModel } from "./fee-dues-models";

export const dynamic = "force-dynamic";

const handlers = createFeeDuesHandlers();

/** Owner only: Enrollments with money owed, filtered and sorted (ADR-0039). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListTrainingInstituteFeeDuesRequestModel.safeParse({
        filter: url.searchParams.get("filter") ?? undefined,
        sort: url.searchParams.get("sort") ?? undefined,
      }),
    );
    return Response.json(await handlers.queries.dues(session, query));
  } catch (error) {
    return mapError(error);
  }
}
