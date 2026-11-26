import { createClassroomHandlers } from "@/src/preschool/infrastructure/create-classroom-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolManager } from "../../_lib/session";
import { PreschoolClassroomOptionsRequestModel } from "../classroom-models";

export const dynamic = "force-dynamic";

const handlers = createClassroomHandlers();

/** Programmes and this year's Classrooms of a Centre, with seats left. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolManager();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      PreschoolClassroomOptionsRequestModel.safeParse({
        centreId: url.searchParams.get("centreId") ?? undefined,
      }),
    );
    return Response.json(await handlers.options(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
