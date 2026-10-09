import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { labour } from "./handlers";
import {
  CreateConstructionLabourLabourRequestModel,
  ListConstructionLabourLaboursRequestModel,
  queryBoolean,
  toLabourResponse,
  type ListConstructionLabourLaboursResponseModel,
} from "./labour-models";

export const dynamic = "force-dynamic";

/**
 * The Labour register, newest first (CM-207): filter by Project, Active,
 * Supervisor and Labour Category, and search name, Labour Id or contact.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionLabourLaboursRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await labour.labours.list({
      workspaceId: session.workspaceId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
      projectId: model.projectId,
      active: queryBoolean(model.active),
      search: model.q,
      supervisorId: model.supervisorId,
      labourCategoryId: model.categoryId,
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionLabourLaboursResponseModel = {
      items: page.items.map((item) => toLabourResponse(item, session.access)),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds a labourer on a Project (CM-205). The opening balance becomes the
 * first ledger entry, dated the joining date (ADR CM-0004).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionLabourLabourRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await labour.labours.create({
      workspaceId: session.workspaceId,
      labour: model,
      by: session.userId,
    });
    return Response.json(toLabourResponse(created, session.access), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
