import { PrismaMeReader } from "@/src/preschool/infrastructure/prisma-me-reader";

import { mapPreschoolError } from "../_lib/map-error";
import { requirePreschoolActor } from "../_lib/session";

export const dynamic = "force-dynamic";

const reader = new PrismaMeReader();

/** Who the User is in this Preschool: role, Centres, Classrooms, Children. */
export async function GET(): Promise<Response> {
  try {
    const actor = await requirePreschoolActor();
    if (actor instanceof Response) return actor;
    return Response.json(await reader.read(actor));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
