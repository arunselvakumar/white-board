import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";
import {
  canAddEquipment,
  canSeeRates,
  EQUIPMENT_MENU,
  EQUIPMENT_USAGE_MENU,
  equipmentActions,
} from "@/src/site-work/application/equipment-handlers";

import {
  CreateConstructionSiteWorkEquipmentRequestModel,
  ListConstructionSiteWorkEquipmentRequestModel,
  toEquipmentDetailResponse,
  toEquipmentResponse,
  type ListConstructionSiteWorkEquipmentResponseModel,
} from "./equipment-models";
import {
  equipmentHandlers as handlers,
  requireEquipmentAccess,
} from "./handlers";
import type { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The Equipment register, newest first, by ownership, place (a Project or
 * the warehouse), state and search. Needs Equipments Read; the equipment
 * at one Project (`projectId`) is also open to Equipment Usage Read there.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionSiteWorkEquipmentRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireEquipmentAccess(
      request,
      (access) =>
        can(access, EQUIPMENT_MENU, "read") ||
        (model.projectId != null &&
          can(access, EQUIPMENT_USAGE_MENU, "read", {
            projectId: model.projectId,
          })),
      { write: false },
    );
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      ownership: model.ownership,
      projectId: model.projectId,
      warehouse: model.warehouse === "true",
      state: model.state,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
    });
    const last = page.items.at(-1);
    const body: z.infer<typeof ListConstructionSiteWorkEquipmentResponseModel> =
      {
        items: page.items.map((item) =>
          toEquipmentResponse(
            item,
            canSeeRates(session.access, item.currentProjectId),
          ),
        ),
        nextCursor:
          page.hasMore && last != null ? encodeListCursor(last) : null,
        total: page.total,
      };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds equipment at a Project or the warehouse, with its `added`
 * movement (CM-603). Needs Equipments Create, or Equipment Usage Create
 * on that Project; a hire rate needs Financial. 409
 * `EQUIPMENT_NUMBER_TAKEN` for a number already in the register.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionSiteWorkEquipmentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireEquipmentAccess(
      request,
      (access) => canAddEquipment(access, model.projectId),
      { write: true },
    );
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, model);
    const detail = await handlers.get(session.workspaceId, id);
    return Response.json(
      toEquipmentDetailResponse(
        detail,
        equipmentActions(session.access, detail),
      ),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
