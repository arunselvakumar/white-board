import type { AccessSession } from "@/app/api/_lib/require-access";
import type { StoredInvoice } from "@/src/finance/application/party-ports";
import type { Flag } from "@/src/shared-kernel/access";

import { finance, requireDocumentAccess } from "../parties/handlers";
import {
  toSettlementResponse,
  type ConstructionFinanceSettlementResponse,
} from "./settlement-models";

/** The Session plus `flag` on the Project (or Store) of the settled invoice. */
export function requireSettlementAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredInvoice }) | Response> {
  return requireDocumentAccess(request, flag, (workspaceId) =>
    finance.settlements.invoiceOf(workspaceId, id),
  );
}

export async function settlementBody(
  session: AccessSession,
  id: string,
): Promise<ConstructionFinanceSettlementResponse> {
  return toSettlementResponse(
    await finance.settlements.get(session.access, id),
  );
}
