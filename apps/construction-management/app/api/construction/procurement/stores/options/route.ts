import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { can, type MenuKey } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import { permissionDenied } from "../central-store-access";
import { centralStore } from "../central-store-wiring";
import {
  ListConstructionProcurementStoreOptionsRequestModel,
  type ListConstructionProcurementStoreOptionsResponseModel,
} from "../store-models";

export const dynamic = "force-dynamic";

/** Menus whose forms pick a store (Request To, PO / GRN / transfer location). */
const PICKERS: MenuKey[] = [
  "procurement.central_store",
  "procurement.material_requests",
  "procurement.delivery_notes",
  "procurement.purchase_orders",
  "procurement.material_received",
  "procurement.material_transfers",
  "procurement.current_inventory",
  "procurement.central_inventory",
];

/**
 * Live stores by name for pickers, those serving `projectId` when given.
 * Needs read on any procurement menu that picks a store (on the Project
 * for project-level menus).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementStoreOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const scope = model.projectId == null ? {} : { projectId: model.projectId };
    if (!PICKERS.some((menu) => can(access, menu, "read", scope)))
      return permissionDenied();
    const body: ListConstructionProcurementStoreOptionsResponseModel = {
      items: await centralStore.stores.options(
        session.workspaceId,
        model.projectId,
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
