import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderScope } from "@/src/procurement/application/purchase-order-handlers";
import { readPurchaseOrderFormOptions } from "@/src/procurement/infrastructure/purchase-order-form-options";

import {
  PURCHASE_ORDER_MENU,
  purchaseOrderHandlers as handlers,
} from "../handlers";
import {
  GetConstructionProcurementPurchaseOrderFormOptionsRequestModel,
  placeOf,
  toFormOptionsResponse,
} from "../purchase-order-models";

export const dynamic = "force-dynamic";

/**
 * What the PO form picks from at a Project or Store: its active Suppliers,
 * the Company's billing addresses and Terms & Conditions, and the
 * orderable Purchase Requests with their pending items. Needs Purchase
 * Order create or update there.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionProcurementPurchaseOrderFormOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const location = placeOf(model);
    const session = await requireAnyAccess(
      request,
      PURCHASE_ORDER_MENU,
      ["create", "update"],
      purchaseOrderScope(location),
    );
    if (isResponse(session)) return session;
    const located = await handlers.location(session.workspaceId, location);
    const options = await readPurchaseOrderFormOptions(
      prisma,
      session.workspaceId,
      location,
    );
    return Response.json(
      toFormOptionsResponse(
        {
          kind: located.kind,
          id: located.id,
          name: located.name,
          address: located.address,
          stateCode: located.stateCode,
        },
        options,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
