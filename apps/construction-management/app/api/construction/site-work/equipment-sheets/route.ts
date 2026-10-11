import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  equipmentSheetActions,
  seesSheetMoney,
} from "@/src/site-work/application/equipment-sheet-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  CreateConstructionSiteWorkEquipmentSheetRequestModel,
  ListConstructionSiteWorkEquipmentSheetsRequestModel,
  toEquipmentSheetResponse,
  type ListConstructionSiteWorkEquipmentSheetsResponseModel,
} from "./equipment-sheet-models";
import {
  EQUIPMENT_SHEET_MENU,
  equipmentSheetHandlers as handlers,
  equipmentSheetResponse,
} from "./handlers";

export const dynamic = "force-dynamic";

/**
 * A Project's Equipment Usage sheets, newest first, by Sheet Date range,
 * equipment, ownership, Filled By and approval, with the filter options
 * and the totals of hours, km and trips (CM-604). Needs Equipment Usage
 * read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionSiteWorkEquipmentSheetsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, EQUIPMENT_SHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      from: model.from,
      to: model.to,
      equipmentId: model.equipmentId,
      ownership: model.ownership,
      createdBy: model.createdBy,
      approvalStatus: model.approvalStatus,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const financial = seesSheetMoney(session.access, model.projectId);
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionSiteWorkEquipmentSheetsResponseModel = {
      items: page.items.map((item) =>
        toEquipmentSheetResponse(
          item,
          equipmentSheetActions(session.access, item),
          financial,
        ),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      totals: page.totals,
      facets: page.facets,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Saves an Equipment Usage sheet (CM-604): Save, or Save & Approve (needs
 * Approve). Needs Equipment Usage create on the Project. The equipment
 * must be free that date (409 `EQUIPMENT_NOT_ON_PROJECT`,
 * `EQUIPMENT_IN_MAINTENANCE`, `EQUIPMENT_UNAVAILABLE`), with one sheet per
 * date and shift (409 `EQUIPMENT_SHEET_EXISTS`); material lines post
 * Consumed stock (409 `STOCK_INSUFFICIENT`). A unit rate or billable
 * quantity needs Financial (403).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionSiteWorkEquipmentSheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      EQUIPMENT_SHEET_MENU,
      "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, model);
    return await equipmentSheetResponse(session, id, {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
