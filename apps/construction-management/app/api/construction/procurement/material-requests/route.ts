import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { decodeListCursor } from "@/src/shared-kernel/list-cursor";

import {
  actorOf,
  canOnProject,
  pageCursors,
  permissionDenied,
  planGate,
} from "../stores/central-store-access";
import { centralStore } from "../stores/central-store-wiring";
import {
  CreateConstructionProcurementMaterialRequestRequestModel,
  ListConstructionProcurementMaterialRequestsRequestModel,
  toMaterialRequestResponse,
  type ListConstructionProcurementMaterialRequestsResponseModel,
} from "./material-request-models";

export const dynamic = "force-dynamic";

/**
 * Material Requests, newest first. With `projectId`: the Project's
 * (Material Requests read and on the Project). Otherwise the store side:
 * every store's, or one store's with `storeId` (Material Requests read and
 * Central store read).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementMaterialRequestsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const allowed =
      model.projectId == null
        ? can(access, "procurement.material_requests", "read") &&
          can(access, "procurement.central_store", "read")
        : canOnProject(access, "read", model.projectId) ||
          (can(access, "procurement.material_requests", "read") &&
            can(access, "procurement.central_store", "read"));
    if (!allowed) return permissionDenied();
    const page = await centralStore.materialRequests.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      storeId: model.storeId,
      status: model.status,
      from: model.from,
      to: model.to,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const body: ListConstructionProcurementMaterialRequestsResponseModel = {
      items: page.items.map(toMaterialRequestResponse),
      ...pageCursors(page, model),
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Raises a Material Request from a Project to a store serving it
 * (Material Requests create, and on the Project). Request ID from the
 * Material Request numbering of the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionProcurementMaterialRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    if (!canOnProject(access, "create", model.projectId))
      return permissionDenied();
    const ended = await planGate(session, ["create"]);
    if (ended != null) return ended;
    const created = await centralStore.materialRequests.create(
      actorOf(session),
      model,
    );
    return Response.json(toMaterialRequestResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
