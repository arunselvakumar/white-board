import { mapError } from "@/app/api/_lib/map-error";
import { createClassWorkHandlers } from "@/src/training-institute/infrastructure/create-class-work-handlers";

import { requireClassWorkFamily } from "../../homework/class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassWorkHandlers();

/** Homework and Study Material for each Student linked to the User. */
export async function GET(): Promise<Response> {
  try {
    const family = await requireClassWorkFamily();
    if (family instanceof Response) return family;
    return Response.json(await handlers.familyClassWork(family));
  } catch (error) {
    return mapError(error);
  }
}
