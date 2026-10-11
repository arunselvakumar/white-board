import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { worksheetActions } from "@/src/site-work/application/worksheet-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { WORKSHEET_MENU, worksheetHandlers as handlers } from "./handlers";
import {
  CreateConstructionSiteWorkWorksheetRequestModel,
  ListConstructionSiteWorkWorksheetsRequestModel,
  toWorksheetResponse,
  type ListConstructionSiteWorkWorksheetsResponseModel,
} from "./worksheet-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Daily Worksheets, newest first, by Sheet Date range, Filled
 * By, Contractor, Department and approval status, with the filter options
 * (CM-602). Needs Daily Worksheet read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionSiteWorkWorksheetsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      from: model.from,
      to: model.to,
      createdBy: model.createdBy,
      contractorId: model.contractorId,
      departmentId: model.departmentId,
      approvalStatus: model.approvalStatus,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionSiteWorkWorksheetsResponseModel = {
      items: page.items.map((item) =>
        toWorksheetResponse(item, worksheetActions(session.access, item)),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      facets: page.facets,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Saves a Daily Worksheet (CM-602): Save, or Save & Approve (needs
 * Approve). Needs Daily Worksheet create on the Project. The number comes
 * from the WS rule, the date from the back-dated policy, and each material
 * line posts Consumed stock (409 `STOCK_INSUFFICIENT` refuses the save).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionSiteWorkWorksheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "create", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, model);
    const sheet = await handlers.get(session.workspaceId, id);
    return Response.json(
      toWorksheetResponse(sheet, worksheetActions(session.access, sheet)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
