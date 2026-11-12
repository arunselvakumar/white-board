import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeNameCursor,
  encodeNameCursor,
} from "@/src/shared-kernel/list-cursor";
import { prospectCompanyNameKey } from "@/src/marketing/domain/prospect-company";

import {
  CreateConstructionMarketingProspectCompanyRequestModel,
  ListConstructionMarketingProspectCompaniesRequestModel,
  toProspectCompanyListItemResponse,
  toProspectCompanyResponse,
  type ListConstructionMarketingProspectCompaniesResponse,
} from "./company-models";
import {
  COMPANIES_MENU,
  prospectCompanyHandlers as handlers,
} from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Prospect Companies A–Z (PRD §3.3): search on the name, city, a Contact's
 * name or mobile; filter by Stage, assigned person and industry. Without
 * View all, only those the caller created or is assigned (ADR CM-0040 §5).
 * Needs Companies read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionMarketingProspectCompaniesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await handlers.list(session.access, {
      search: model.search,
      stages: model.stage,
      assignedMemberId: model.assignedMemberId,
      industry: model.industry,
      limit: model.limit,
      // An empty cursor is the first page. No `.transform` in the model:
      // the OpenAPI document cannot show one.
      after: model.after ? decodeNameCursor(model.after) : undefined,
    });
    const last = page.items.at(-1);
    const body: ListConstructionMarketingProspectCompaniesResponse = {
      items: page.items.map(toProspectCompanyListItemResponse),
      nextCursor:
        page.hasMore && last != null
          ? encodeNameCursor({
              name: prospectCompanyNameKey(last.name),
              id: last.id,
            })
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
 * Adds a Prospect Company at New, assigned to the creator unless another
 * active Marketing Person is picked, with an optional first Contact. 409
 * `PROSPECT_COMPANY_NAME_IN_USE` when a live company has the name, whoever
 * it belongs to. Needs Companies create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, COMPANIES_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionMarketingProspectCompanyRequestModel.safeParse(
        await request.json(),
      ),
    );
    const id = await handlers.create(session.access, model);
    return Response.json(
      toProspectCompanyResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
