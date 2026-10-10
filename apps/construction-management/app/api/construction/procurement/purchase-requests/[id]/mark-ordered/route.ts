import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { purchaseRequestActions } from "@/src/procurement/application/purchase-request-handlers";

import {
  PURCHASE_REQUEST_MENU,
  purchaseRequestHandlers as handlers,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseRequestParamsModel,
  DecideConstructionProcurementPurchaseRequestRequestModel,
  toPurchaseRequestDetailResponse,
} from "../../purchase-request-models";

export const dynamic = "force-dynamic";

/**
 * Mark as Ordered: the request was ordered outside the app (cash
 * purchase, phone order). Allowed from approved or partially ordered
 * (CM-0015 §7); needs update or Approve on its Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const company = await requireCompanySession(request);
    if (isResponse(company)) return company;
    const target = await handlers.find(company.workspaceId, id);
    const session = await requireAnyAccess(
      request,
      PURCHASE_REQUEST_MENU,
      ["update", "approve"],
      {
        projectId: target.projectId,
      },
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DecideConstructionProcurementPurchaseRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.markOrdered(
      session.access,
      id,
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    const pr = await handlers.get(session.workspaceId, id);
    return Response.json(
      toPurchaseRequestDetailResponse(
        pr,
        purchaseRequestActions(session.access, pr),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
