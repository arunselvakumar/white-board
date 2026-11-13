import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { VISITS_MENU, visitHandlers as handlers } from "./handlers";
import {
  CreateConstructionMarketingVisitRequestModel,
  ListConstructionMarketingVisitsRequestModel,
  toVisitListItemResponse,
  toVisitResponse,
  type ListConstructionMarketingVisitsResponse,
} from "./visit-models";

export const dynamic = "force-dynamic";

/**
 * Visits, newest first: by date range (Company time zone), visitor,
 * Prospect Company, status (Missed included), purpose and interest.
 * Without View all, only those the caller created or is a visitor on (ADR
 * CM-0040 §5). Needs Visits read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionMarketingVisitsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await handlers.list(session.access, {
      from: model.from,
      to: model.to,
      memberId: model.memberId,
      prospectCompanyId: model.prospectCompanyId,
      statuses: model.status,
      purposes: model.purpose,
      interests: model.interest,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
    });
    const last = page.items.at(-1);
    const body: ListConstructionMarketingVisitsResponse = {
      items: page.items.map(toVisitListItemResponse),
      nextCursor:
        page.hasMore && last != null
          ? encodeListCursor({ createdAt: last.visitAt, id: last.id })
          : null,
      total: page.total,
      timeZone: page.timeZone,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Plans a Visit, or logs a past one as Completed, numbered `MV-0001`. The
 * Prospect Company and new Contacts can be added in the same save. A
 * Completed one moves its company from New to Contacted. Needs Visits
 * read and create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionMarketingVisitRequestModel.safeParse(
        await request.json(),
      ),
    );
    const id = await handlers.create(session.access, {
      ...model,
      visitAt: new Date(model.visitAt),
    });
    return Response.json(
      toVisitResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
