import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import {
  AttendanceRegisterParamsModel,
  mapAttendanceRegister,
} from "@/app/api/attendance/registers/attendance-models";
import { createAttendanceHandlers } from "@/src/training-institute/infrastructure/create-attendance-handlers";
import { SaveAttendanceMarksRequestModel } from "./save-attendance-marks-request-model";

const handlers = createAttendanceHandlers();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const { id } = parseOrThrow(
      AttendanceRegisterParamsModel.safeParse(await context.params),
    );
    const { marks } = parseOrThrow(
      SaveAttendanceMarksRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      mapAttendanceRegister(await handlers.save(id, marks, actor)),
    );
  } catch (error) {
    return mapError(error);
  }
}
