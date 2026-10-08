import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";

import type { GetConstructionOrganizationSubscriptionResponseModel } from "./get-subscription-response-model";
import { toBillingAddressResponse } from "./subscription-fields";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/**
 * "Your Subscription" (CM-116): any Team Member of the Active Company sees
 * the plan, expiry and usage; amounts and billing only the Owner.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const view = await handlers.overview(session.workspaceId, {
      isOwner: session.role === "owner",
    });
    const body: GetConstructionOrganizationSubscriptionResponseModel = {
      planCode: view.planCode,
      planName: view.planName,
      status: view.status,
      isTrial: view.isTrial,
      startsAt: view.startsAt.toISOString(),
      endsAt: view.endsAt.toISOString(),
      daysLeft: view.daysLeft,
      autoRenew: view.autoRenew,
      usage: view.usage,
      addOns: view.addOns,
      canManage: view.canManage,
      owner:
        view.owner == null
          ? null
          : {
              unusedValuePaise: view.owner.unusedValue,
              lastBillingAddress:
                view.owner.lastBillingAddress == null
                  ? null
                  : toBillingAddressResponse(view.owner.lastBillingAddress),
              paymentsConfigured: view.owner.paymentsConfigured,
            },
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
