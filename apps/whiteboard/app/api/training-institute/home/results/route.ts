import { mapError } from "@/app/api/_lib/map-error";
import { createClassTestHandlers } from "@/src/training-institute/infrastructure/create-class-test-handlers";

import { requireClassWorkFamily } from "../../homework/class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassTestHandlers();

/** Published Test results of each Student linked to the User. */
export async function GET(): Promise<Response> {
  try {
    const family = await requireClassWorkFamily();
    if (family instanceof Response) return family;
    return Response.json(await handlers.familyResults(family));
  } catch (error) {
    return mapError(error);
  }
}
