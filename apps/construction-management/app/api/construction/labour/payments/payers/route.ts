import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { paymentMenu, wagePaymentHandlers as handlers } from "../handlers";
import {
  ListConstructionLabourPaymentPayersRequestModel,
  type ListConstructionLabourPaymentPayersResponseModel,
} from "../payment-models";

export const dynamic = "force-dynamic";

/**
 * Team Members who can be chosen as "Paid by" on the pay dialog, and the
 * caller's own (the default). Needs Labour or Vendor create on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionLabourPaymentPayersRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      paymentMenu(model.partyType),
      "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const body: ListConstructionLabourPaymentPayersResponseModel =
      await handlers.payers(session.workspaceId, session.userId);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
