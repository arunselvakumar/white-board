import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeNameCursor,
  encodeNameCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  CreateConstructionMarketingFollowUpRequestModel,
  ListConstructionMarketingFollowUpsRequestModel,
  toFollowUpResponse,
} from "./follow-up-models";
import { FOLLOW_UPS_MENU, followUpHandlers as handlers } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Follow-ups by due date, each Overdue, Today or Upcoming while Open on
 * the Company's today. `mine=1` keeps only the caller's. Without View all,
 * only those the caller created or owns (ADR CM-0040 §5). Needs Follow-ups
 * read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, FOLLOW_UPS_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionMarketingFollowUpsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const after =
      model.after == null ? undefined : decodeNameCursor(model.after);
    const page = await handlers.list(session.access, {
      mine: model.mine === "1",
      ownerMemberId: model.ownerMemberId,
      statuses: model.status,
      prospectCompanyId: model.prospectCompanyId,
      visitId: model.visitId,
      limit: model.limit,
      after: after == null ? undefined : { dueDate: after.name, id: after.id },
    });
    const last = page.items.at(-1);
    return Response.json({
      items: page.items.map(toFollowUpResponse),
      nextCursor:
        page.hasMore && last != null
          ? encodeNameCursor({ name: last.dueDate, id: last.id })
          : null,
      total: page.total,
      today: page.today,
    });
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a Follow-up to a Prospect Company. Needs Follow-ups create. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, FOLLOW_UPS_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionMarketingFollowUpRequestModel.safeParse(
        await request.json(),
      ),
    );
    const id = await handlers.create(session.access, model);
    return Response.json(
      toFollowUpResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
