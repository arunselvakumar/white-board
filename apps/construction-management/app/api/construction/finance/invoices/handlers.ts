import type { AccessSession } from "@/app/api/_lib/require-access";
import { invoiceActions } from "@/src/finance/application/invoice-handlers";
import type { StoredInvoice } from "@/src/finance/application/party-ports";
import type { Flag } from "@/src/shared-kernel/access";

import { finance, requireDocumentAccess } from "../parties/handlers";
import {
  toInvoiceResponse,
  type ConstructionFinanceInvoiceResponse,
} from "./invoice-models";

/** The Session plus `flag` on the invoice's Project (or Store). */
export function requireInvoiceAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredInvoice }) | Response> {
  return requireDocumentAccess(request, flag, (workspaceId) =>
    finance.invoices.find(workspaceId, id),
  );
}

/** The invoice as the viewer sees it. */
export async function invoiceBody(
  session: AccessSession,
  id: string,
): Promise<ConstructionFinanceInvoiceResponse> {
  const view = await finance.invoices.get(session.workspaceId, id);
  return toInvoiceResponse(view, invoiceActions(session.access, view));
}
