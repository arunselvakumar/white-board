import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  labourAttendanceHandlers as handlers,
  labourFinancial,
} from "./handlers";
import {
  ListConstructionLabourLabourAttendanceRequestModel,
  toLabourAttendanceDayResponse,
  type ListConstructionLabourLabourAttendanceResponseModel,
} from "./labour-attendance-models";

export const dynamic = "force-dynamic";

/** A list position: the attendance date (in the cursor's time slot) and the row id. */
function cursorOf(day: { date: string; id: string }): string {
  return encodeListCursor({
    createdAt: calendarDateToDb(day.date),
    id: day.id,
  });
}

/**
 * Marked labour days of a Project, newest date first (CM-211): filter by
 * dates, labourer, Supervisor and status, with bidirectional cursors and a
 * total. Needs Attendance read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionLabourLabourAttendanceRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const decode = (raw: string) => {
      const cursor = decodeListCursor(raw);
      // Normalise to the date column's midnight.
      return {
        createdAt: calendarDateToDb(calendarDateFromDb(cursor.createdAt)),
        id: cursor.id,
      };
    };
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      from: model.from,
      to: model.to,
      labourId: model.labourId,
      supervisorId: model.supervisorId,
      status: model.status,
      limit: model.limit,
      after: model.after == null ? undefined : decode(model.after),
      before: model.before == null ? undefined : decode(model.before),
    });
    const financial = labourFinancial(session.access, model.projectId);
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionLabourLabourAttendanceResponseModel = {
      items: page.items.map((item) =>
        toLabourAttendanceDayResponse(item, financial),
      ),
      nextCursor: moreAfter && last != null ? cursorOf(last) : null,
      prevCursor: moreBefore && first != null ? cursorOf(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
