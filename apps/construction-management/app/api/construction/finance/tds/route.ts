import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { finance, PARTIES_MENU } from "../parties/handlers";
import {
  GetConstructionFinanceTdsLedgerRequestModel,
  toTdsLedgerResponse,
} from "./tds-models";

export const dynamic = "force-dynamic";

/**
 * The TDS ledger of a Contractor for a financial year (CM-706, CM-0017
 * §8): each payment's base, rate, TDS and override, and the quarter
 * totals for filing. A member sees the Projects they read Parties on.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PARTIES_MENU, "read");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionFinanceTdsLedgerRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const ledger = await finance.queries.tdsLedger(
      session.access,
      model.contractorId,
      model.fy,
    );
    return Response.json(toTdsLedgerResponse(ledger));
  } catch (error) {
    return mapError(error);
  }
}
