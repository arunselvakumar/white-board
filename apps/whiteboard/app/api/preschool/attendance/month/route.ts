import { createAttendanceHandlers } from "@/src/preschool/infrastructure/create-attendance-handlers";

import { mapPreschoolError, parseOrThrow } from "../../_lib/map-error";
import { requirePreschoolStaff } from "../../_lib/session";
import { PreschoolAttendanceMonthRequestModel } from "../attendance-models";

export const dynamic = "force-dynamic";

const handlers = createAttendanceHandlers();

/** A Classroom's monthly register. */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requirePreschoolStaff();
    if (actor instanceof Response) return actor;
    const query = parseOrThrow(
      PreschoolAttendanceMonthRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    return Response.json(await handlers.month(actor, query));
  } catch (error) {
    return mapPreschoolError(error);
  }
}
