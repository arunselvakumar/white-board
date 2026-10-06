import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { createAttendanceHandlers } from "@/src/training-institute/infrastructure/create-attendance-handlers";
import {
  ListAttendanceRegistersRequestModel,
  mapAttendanceRegister,
  OpenAttendanceRegisterRequestModel,
} from "./attendance-models";

const handlers = createAttendanceHandlers();

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const { batchId, date } = parseOrThrow(
      OpenAttendanceRegisterRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      mapAttendanceRegister(await handlers.open(batchId, actor, date)),
      { status: 201 },
    );
  } catch (error) {
    return mapError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireAttendanceSession();
    if (actor instanceof Response) return actor;
    const url = new URL(request.url);
    const query = parseOrThrow(
      ListAttendanceRegistersRequestModel.safeParse({
        batchId: url.searchParams.get("batchId"),
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const page = await handlers.listBatch(query, actor);
    return Response.json({
      ...page,
      items: page.items.map(mapAttendanceRegister),
    });
  } catch (error) {
    return mapError(error);
  }
}
