import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  ListConstructionLabourCheckInEntriesRequestModel,
  RecordConstructionLabourCheckInRequestModel,
  type ListConstructionLabourCheckInEntriesResponseModel,
  type RecordConstructionLabourCheckInResponseModel,
} from "./check-in-models";
import {
  checkInHandlers as handlers,
  toContextResponse,
  toDayResponse,
  toEntryResponse,
  toPersonResponse,
  viewerOf,
} from "./handlers";

export const dynamic = "force-dynamic";

/** A list position: the entry's instant and id. */
function cursorOf(entry: { at: Date; id: string }): string {
  return encodeListCursor({ createdAt: entry.at, id: entry.id });
}

/**
 * The Check-In log: a day's entries on a Project, newest first, voided
 * ones included, by kind and part of the person's name, with
 * bidirectional cursors and a total. Needs Attendance read on the
 * Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionLabourCheckInEntriesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const page = await handlers.log(
      {
        workspaceId: session.workspaceId,
        projectId: model.projectId,
        date: model.date,
        kind: model.kind,
        q: model.q,
        limit: model.limit,
        after: model.after == null ? undefined : decodeListCursor(model.after),
        before:
          model.before == null ? undefined : decodeListCursor(model.before),
      },
      viewerOf(session.access, model.projectId),
    );
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionLabourCheckInEntriesResponseModel = {
      ...toContextResponse(page),
      date: page.date,
      items: page.items.map(toEntryResponse),
      nextCursor: moreAfter && last != null ? cursorOf(last) : null,
      prevCursor: moreBefore && first != null ? cursorOf(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Records a Check In or Check Out on a Project with its photo (base64,
 * checked by content, at most 1 MB) and the device's location when there
 * is one. 201 with the entry; 200 with `repeated` when the same action
 * was recorded in the last two minutes (nothing is written). A Labour's
 * entry writes their attendance day in the same transaction. Needs
 * Attendance create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RecordConstructionLabourCheckInRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      "labour.attendance",
      "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const recorded = await handlers.record({
      workspaceId: session.workspaceId,
      userId: session.userId,
      projectId: model.projectId,
      kind: model.kind,
      personId: model.personId,
      action: model.action,
      photo: model.photo,
      location: model.location,
    });
    const body: RecordConstructionLabourCheckInResponseModel = {
      entry: toEntryResponse(recorded.entry),
      repeated: recorded.repeated,
      person: toPersonResponse(recorded.person),
      day: toDayResponse(recorded.day),
    };
    return Response.json(body, {
      status: recorded.repeated ? StatusCodes.OK : StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
