import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import {
  requireSalesProjectAccess,
  requireSalesRecordAccess,
} from "@/app/api/construction/sales/sales-access";
import { salesSettingsHandlers as handlers } from "@/src/composition/sales-settings";
import type { SalesListItem } from "@/src/sales/application/sales-settings-handlers";
import type {
  SalesListKind,
  SalesPickList,
} from "@/src/sales/domain/sales-lists";

import {
  ConstructionSalesListItemParamsModel,
  CreateConstructionSalesListItemRequestModel,
  MoveConstructionSalesFunnelStageRequestModel,
  RenameConstructionSalesListItemRequestModel,
  toFunnelStageResponse,
  toPickListItemResponse,
  type ListConstructionSalesFunnelStagesResponse,
} from "./settings-models";

export const SALES_SETTINGS_MENU = "sales.inquiries";

type ItemContext = { params: Promise<{ id: string }> };

function respond(kind: SalesListKind, row: SalesListItem) {
  return kind === "funnel_stage"
    ? toFunnelStageResponse(row)
    : toPickListItemResponse(row);
}

/** The row first (404 for another Company's or a deleted one), then Update on its Project. */
async function requireItem(
  request: Request,
  kind: SalesListKind,
  context: ItemContext,
) {
  const { id } = parseOrThrow(
    ConstructionSalesListItemParamsModel.safeParse(await context.params),
  );
  const session = await requireSalesRecordAccess(
    request,
    SALES_SETTINGS_MENU,
    "update",
    (workspaceId) => handlers.find(workspaceId, kind, id),
  );
  return { id, session };
}

/**
 * The routes of one list (CM-1002): add, rename and delete; Lead Sources
 * and Lost Reasons also disable and enable. Every one needs Inquiry Update
 * on the Project.
 */
export function salesListRoutes(kind: SalesListKind) {
  return {
    /** Adds a row; a stage goes last. 409 `<KIND>_NAME_IN_USE`. */
    create: async (request: Request): Promise<Response> => {
      try {
        const raw: unknown = await request.json();
        const session = await requireSalesProjectAccess(
          request,
          SALES_SETTINGS_MENU,
          "update",
          requestProjectId(raw),
        );
        if (isResponse(session)) return session;
        const model = parseOrThrow(
          CreateConstructionSalesListItemRequestModel.safeParse(raw),
        );
        const row = await handlers.create(
          session.access,
          kind,
          model.projectId,
          model.name,
        );
        return Response.json(respond(kind, row), {
          status: StatusCodes.CREATED,
        });
      } catch (error) {
        return mapError(error);
      }
    },

    /** Renames a row (seeds too). 409 `<KIND>_NAME_IN_USE` / `<KIND>_CHANGED`. */
    rename: async (request: Request, context: ItemContext) => {
      try {
        const { id, session } = await requireItem(request, kind, context);
        if (isResponse(session)) return session;
        const model = parseOrThrow(
          RenameConstructionSalesListItemRequestModel.safeParse(
            await request.json(),
          ),
        );
        const row = await handlers.rename(
          session.access,
          kind,
          id,
          model.name,
          new Date(model.expectedUpdatedAt),
        );
        return Response.json(respond(kind, row));
      } catch (error) {
        return mapError(error);
      }
    },

    /** Deletes a row; 409 when inquiries use it (or the Project's last stage). */
    remove: async (request: Request, context: ItemContext) => {
      try {
        const { id, session } = await requireItem(request, kind, context);
        if (isResponse(session)) return session;
        await handlers.delete(session.access, kind, id);
        return new Response(null, { status: StatusCodes.NO_CONTENT });
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

/** Disable or enable a Lead Source or Lost Reason. */
export function salesPickToggleRoute(kind: SalesPickList, active: boolean) {
  return async (request: Request, context: ItemContext) => {
    try {
      const { id, session } = await requireItem(request, kind, context);
      if (isResponse(session)) return session;
      const row = await handlers.setActive(session.access, kind, id, active);
      return Response.json(toPickListItemResponse(row));
    } catch (error) {
      return mapError(error);
    }
  };
}

/** Moves a stage one place; answers with the stages in their new order. */
export async function moveFunnelStage(
  request: Request,
  context: ItemContext,
): Promise<Response> {
  try {
    const { id, session } = await requireItem(request, "funnel_stage", context);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      MoveConstructionSalesFunnelStageRequestModel.safeParse(
        await request.json(),
      ),
    );
    const rows = await handlers.moveStage(session.access, id, model.direction);
    const body: ListConstructionSalesFunnelStagesResponse = {
      items: rows.map(toFunnelStageResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

export const funnelStageRoutes = salesListRoutes("funnel_stage");
export const leadSourceRoutes = salesListRoutes("lead_source");
export const lostReasonRoutes = salesListRoutes("lost_reason");
