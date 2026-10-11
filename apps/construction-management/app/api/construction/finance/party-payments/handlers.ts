import type { AccessSession } from "@/app/api/_lib/require-access";
import { paymentActions } from "@/src/finance/application/party-payment-handlers";
import type { StoredPartyPayment } from "@/src/finance/application/party-ports";
import type { Flag } from "@/src/shared-kernel/access";

import { finance, requireDocumentAccess } from "../parties/handlers";
import {
  toPartyPaymentResponse,
  type ConstructionFinancePartyPaymentResponse,
} from "./party-payment-models";

/** The Session plus `flag` on the payment's Project (or Store). */
export function requirePaymentAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredPartyPayment }) | Response> {
  return requireDocumentAccess(request, flag, (workspaceId) =>
    finance.payments.find(workspaceId, id),
  );
}

/** The payment as the viewer sees it. */
export async function paymentBody(
  session: AccessSession,
  id: string,
): Promise<ConstructionFinancePartyPaymentResponse> {
  const view = await finance.payments.get(session.workspaceId, id);
  return toPartyPaymentResponse(view, paymentActions(session.access, view));
}
