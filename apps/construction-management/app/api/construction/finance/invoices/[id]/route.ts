import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionFinancePartyIdParamsModel } from "../../parties/party-shared-models";
import { invoiceBody, requireInvoiceAccess } from "../handlers";

export const dynamic = "force-dynamic";

/** One invoice with its payments, GRNs and settlements (Parties read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinancePartyIdParamsModel.safeParse(await context.params),
    );
    const session = await requireInvoiceAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(await invoiceBody(session, id));
  } catch (error) {
    return mapError(error);
  }
}
