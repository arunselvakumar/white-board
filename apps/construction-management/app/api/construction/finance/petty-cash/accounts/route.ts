import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { seesEveryPettyCashAccount } from "@/src/finance/application/petty-cash-access";

import { PETTY_CASH_MENU, datesFor, pettyCashAccounts } from "../handlers";
import {
  OpenConstructionFinancePettyCashAccountRequestModel,
  toPettyCashAccountResponse,
  type ListConstructionFinancePettyCashAccountsResponseModel,
} from "../petty-cash-models";

export const dynamic = "force-dynamic";

/**
 * Petty-cash accounts with their holder, balance (approved entries only),
 * pending total and last voucher date (CM-703). Every account with Petty
 * Cash View all (and for the Owner); otherwise only the caller's own.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "read");
    if (isResponse(session)) return session;
    const items = await pettyCashAccounts.list(session.access);
    const body: ListConstructionFinancePettyCashAccountsResponseModel = {
      items: items.map(toPettyCashAccountResponse),
      viewAll: seesEveryPettyCashAccount(session.access),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Opens a Team Member's petty-cash account (Petty Cash Create): one live
 * account each; an opening balance posts an opening entry.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PETTY_CASH_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      OpenConstructionFinancePettyCashAccountRequestModel.safeParse(
        await request.json(),
      ),
    );
    const dates = await datesFor(session);
    const opened = await pettyCashAccounts.open(session.access, {
      holderMemberId: model.holderMemberId,
      name: model.name ?? null,
      openingBalance: BigInt(model.openingBalance),
      openingDate: model.openingDate ?? null,
      today: dates.today,
    });
    return Response.json(toPettyCashAccountResponse(opened), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
