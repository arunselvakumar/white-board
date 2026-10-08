import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { GST_RATE_PERCENT } from "@/src/organization/domain/checkout";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";

import type { ListConstructionOrganizationPlansResponseModel } from "./list-plans-response-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

/** The plans and add-ons on sale, for checkout (CM-117). Owner only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const { catalogue } = handlers;
    const body: ListConstructionOrganizationPlansResponseModel = {
      version: catalogue.version,
      currency: catalogue.currency,
      gstRatePercent: GST_RATE_PERCENT,
      paymentsConfigured: handlers.paymentsConfigured,
      plans: catalogue.plans.map((plan) => ({
        code: plan.code,
        name: plan.name,
        rank: plan.rank,
        durations: plan.durations.map((duration) => ({ ...duration })),
        includes: { ...plan.includes },
      })),
      addOns: catalogue.addOns.map((addOn) => ({ ...addOn })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
