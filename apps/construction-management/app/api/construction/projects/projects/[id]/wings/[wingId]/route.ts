import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { wingHandlers } from "../handlers";
import {
  ConstructionProjectsWingParamsModel,
  toWingResponse,
} from "../wing-models";

export const dynamic = "force-dynamic";

/** One Wing with its floors and units (CM-402), for Edit Wing and the chart. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; wingId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "read");
    if (isResponse(session)) return session;
    const { id, wingId } = parseOrThrow(
      ConstructionProjectsWingParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toWingResponse(await wingHandlers.get(session.access, id, wingId)),
    );
  } catch (error) {
    return mapError(error);
  }
}
