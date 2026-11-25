import { createFamilyHandlers } from "@/src/preschool/infrastructure/create-family-handlers";

import { mapPreschoolError } from "../../_lib/map-error";
import { requirePreschoolActor } from "../../_lib/session";

export const dynamic = "force-dynamic";

const handlers = createFamilyHandlers();

/** A Parent's Home: each of their Children's day, latest report and fees. */
export async function GET(): Promise<Response> {
  try {
    const actor = await requirePreschoolActor(["parent"]);
    if (actor instanceof Response) return actor;
    return Response.json(await handlers.home(actor));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
