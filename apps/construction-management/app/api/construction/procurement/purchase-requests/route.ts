import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseRequestActions } from "@/src/procurement/application/purchase-request-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  PURCHASE_REQUEST_MENU,
  purchaseRequestHandlers as handlers,
} from "./handlers";
import {
  CreateConstructionProcurementPurchaseRequestRequestModel,
  ListConstructionProcurementPurchaseRequestsRequestModel,
  toPurchaseRequestDetailResponse,
  toPurchaseRequestResponse,
  type ListConstructionProcurementPurchaseRequestsResponseModel,
} from "./purchase-request-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Purchase Requests, newest first, by Request Date range,
 * approval, fulfilment, Material Category, Material, creator and location
 * type, with the filter options (CM-503). Needs Purchase Request read on
 * the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementPurchaseRequestsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      PURCHASE_REQUEST_MENU,
      "read",
      {
        projectId: model.projectId,
      },
    );
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      from: model.from,
      to: model.to,
      approvalStatus: model.approvalStatus,
      orderStatus: model.orderStatus,
      categoryId: model.categoryId,
      materialId: model.materialId,
      createdBy: model.createdBy,
      locationType: model.locationType,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionProcurementPurchaseRequestsResponseModel = {
      items: page.items.map((item) =>
        toPurchaseRequestResponse(
          item,
          purchaseRequestActions(session.access, item),
        ),
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
 * Raises a Purchase Request (CM-503): Save (pending) or Save & Approve
 * (needs Approve). Needs Purchase Request create on the Project; the
 * number comes from the Purchase Request numbering rule and the Request
 * Date from the back-dated policy.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionProcurementPurchaseRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      PURCHASE_REQUEST_MENU,
      "create",
      {
        projectId: model.projectId,
      },
    );
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, model);
    const pr = await handlers.get(session.workspaceId, id);
    return Response.json(
      toPurchaseRequestDetailResponse(
        pr,
        purchaseRequestActions(session.access, pr),
      ),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
