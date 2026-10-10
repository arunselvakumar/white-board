import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import {
  goodsReceiptNotFound,
  type GoodsReceiptActor,
  type StoredGoodsReceipt,
} from "@/src/procurement/application/goods-receipt-handlers";
import { PROCUREMENT_DOCUMENTS } from "@/src/procurement/domain/documents";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { createGoodsReceiptHandlers } from "@/src/procurement/infrastructure/goods-receipt-factory";
import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { isWriteFlag } from "@/src/shared-kernel/plan";
import { procurementEvents } from "@/src/procurement/infrastructure/procurement-events";

/** One set of Goods Receipt handlers for every route (CM-505). */
export const goodsReceiptHandlers = createGoodsReceiptHandlers({
  directory: procurementDirectory,
  dispatcher: procurementEvents,
  media: projectMediaDispatcher(),
});

/** Material Received (`modules/06` #30): C R U D P N V O F, project-scoped. */
export const GOODS_RECEIPT_MENU = PROCUREMENT_DOCUMENTS.goods_receipt.menu;

/** A Project is checked as the menu's project; a Store at Company level. */
export function locationScope(location: StockLocation): {
  projectId?: string;
} {
  return location.kind === "project" ? { projectId: location.id } : {};
}

export function receiptFinancial(
  access: MemberAccess,
  location: StockLocation,
): boolean {
  return can(access, GOODS_RECEIPT_MENU, "financial", locationScope(location));
}

export function actorOf(session: {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
}): GoodsReceiptActor {
  return {
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: session.role,
  };
}

function permissionDenied(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PERMISSION_DENIED",
    "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
  );
}

/**
 * The Session plus the Permission Matrix check for a route about one GRN:
 * the GRN is loaded first (404 for another Company's or a deleted one),
 * then `flag` on its Project (or Store). Without View All a member sees
 * only GRNs they created; others are 404. Write flags need an active plan.
 */
export async function requireReceiptAccess(
  request: Request,
  flag: Flag,
  id: string,
): Promise<(AccessSession & { receipt: StoredGoodsReceipt }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const access = await loadMemberAccess(prisma, session);
  const receipt = await goodsReceiptHandlers.get(session.workspaceId, id);
  const scope = locationScope(receipt.location);
  if (!can(access, GOODS_RECEIPT_MENU, "read", scope))
    return permissionDenied();
  if (
    !can(access, GOODS_RECEIPT_MENU, "view_all", scope) &&
    receipt.createdBy !== session.userId
  )
    throw goodsReceiptNotFound();
  if (!can(access, GOODS_RECEIPT_MENU, flag, scope)) return permissionDenied();
  if (isWriteFlag(flag)) {
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
  }
  return { ...session, access, receipt };
}
