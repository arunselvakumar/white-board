import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { createAttendanceHandlers } from "@/src/training/infrastructure/create-attendance-handlers";
import {
  AttendanceRegisterParamsModel,
  mapAttendanceRegister,
} from "../attendance-models";

const handlers = createAttendanceHandlers();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      AttendanceRegisterParamsModel.safeParse(await context.params),
    );
    return Response.json(mapAttendanceRegister(await handlers.get(id, actor)));
  } catch (error) {
    return mapError(error);
  }
}
