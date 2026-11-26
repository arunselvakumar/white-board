import { createProgrammeHandlers } from "@/src/preschool/infrastructure/create-programme-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolOwner } from "../../_lib/session";
import { ReorderPreschoolProgrammesRequestModel } from "../programme-models";

export const dynamic = "force-dynamic";

const handlers = createProgrammeHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolOwner();
    if (actor instanceof Response) return actor;
    const { programmeIds } = parseOrThrow(
      ReorderPreschoolProgrammesRequestModel.safeParse(await request.json()),
    );
    return Response.json(await handlers.reorder(actor, programmeIds));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
