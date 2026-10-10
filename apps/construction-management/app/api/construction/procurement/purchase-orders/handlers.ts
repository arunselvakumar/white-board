import { prisma } from "@repo/construction-db";

import {
  requireAnyAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import {
  PurchaseOrderHandlers,
  purchaseOrderScope,
  type StoredPurchaseOrder,
} from "@/src/procurement/application/purchase-order-handlers";
import { PROCUREMENT_DOCUMENTS } from "@/src/procurement/domain/documents";
import { PrismaPurchaseOrderStore } from "@/src/procurement/infrastructure/prisma-purchase-order-store";
import { PrismaPurchaseRequestStore } from "@/src/procurement/infrastructure/prisma-purchase-request-store";
import { loadBackdatedCheck } from "@/src/procurement/infrastructure/procurement-guards";
import { recomputePurchaseRequestOrdering } from "@/src/procurement/infrastructure/purchase-request-ordering";
import type { Flag } from "@/src/shared-kernel/access";
import { companyToday } from "@/src/shared-kernel/company-today";
import { procurementEvents } from "@/src/procurement/infrastructure/procurement-events";

export const PURCHASE_ORDER_MENU = PROCUREMENT_DOCUMENTS.purchase_order.menu;

/** One set of Purchase Order handlers for every route (CM-504). */
export const purchaseOrderHandlers = new PurchaseOrderHandlers({
  db: prisma,
  store: new PrismaPurchaseOrderStore(),
  purchaseRequests: new PrismaPurchaseRequestStore(),
  ordering: recomputePurchaseRequestOrdering,
  directory: procurementDirectory,
  locations: createProjectLocations(),
  backdated: (access) => loadBackdatedCheck(prisma, access),
  today: (workspaceId) => companyToday(prisma, workspaceId),
  events: procurementEvents,
  media: projectMediaDispatcher(),
});

/**
 * The Session plus the Permission Matrix check for a route about one
 * Purchase Order: loaded first (404 for another Company's or a deleted
 * one), then any of `flags` on its Project (a Store PO has no Project
 * scope), then the plan for write flags.
 */
export async function requirePurchaseOrderAccess(
  request: Request,
  id: string,
  flags: readonly [Flag, ...Flag[]],
): Promise<(AccessSession & { target: StoredPurchaseOrder }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await purchaseOrderHandlers.find(session.workspaceId, id);
  const access = await requireAnyAccess(
    request,
    PURCHASE_ORDER_MENU,
    flags,
    purchaseOrderScope(target.location),
  );
  if (isResponse(access)) return access;
  return { ...access, target };
}
