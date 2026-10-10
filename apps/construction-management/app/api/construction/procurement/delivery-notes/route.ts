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
  canOnRequest,
  pageCursors,
  permissionDenied,
  planGate,
} from "../stores/central-store-access";
import { centralStore } from "../stores/central-store-wiring";
import {
  CreateConstructionProcurementDeliveryNoteRequestModel,
  ListConstructionProcurementDeliveryNotesRequestModel,
  toDeliveryNoteResponse,
  type ListConstructionProcurementDeliveryNotesResponseModel,
} from "./delivery-note-models";

export const dynamic = "force-dynamic";

/**
 * Delivery Notes, newest first: every one with Delivery Note read; a
 * Project's (`projectId`) or a request's (`materialRequestId`) with
 * Material Requests read on that Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementDeliveryNotesRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    let allowed = can(access, "procurement.delivery_notes", "read");
    if (!allowed && model.projectId != null)
      allowed = canOnProject(access, "read", model.projectId);
    if (!allowed && model.materialRequestId != null) {
      const found = await centralStore.materialRequests.get(
        session.workspaceId,
        model.materialRequestId,
      );
      allowed = found != null && canOnRequest(access, "read", found);
    }
    if (!allowed) return permissionDenied();
    const page = await centralStore.deliveryNotes.list({
      workspaceId: session.workspaceId,
      storeId: model.storeId,
      projectId: model.projectId,
      materialRequestId: model.materialRequestId,
      status: model.status,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const body: ListConstructionProcurementDeliveryNotesResponseModel = {
      items: page.items.map(toDeliveryNoteResponse),
      ...pageCursors(page, model),
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Creates a Delivery Note from a Material Request (Delivery Note create;
 * `approve` also needs approve and dispatches at once). Pending moves no
 * stock.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionProcurementDeliveryNoteRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const flags = model.approve
      ? (["create", "approve"] as const)
      : (["create"] as const);
    if (!flags.every((flag) => can(access, "procurement.delivery_notes", flag)))
      return permissionDenied();
    const ended = await planGate(session, flags);
    if (ended != null) return ended;
    const note = await centralStore.deliveryNotes.create(
      actorOf(session),
      model,
    );
    return Response.json(toDeliveryNoteResponse(note), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
