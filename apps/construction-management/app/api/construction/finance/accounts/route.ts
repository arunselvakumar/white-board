import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CreateConstructionFinanceAccountRequestModel,
  type ListConstructionFinanceAccountsResponseModel,
} from "./account-models";
import { accountHandlers as handlers, toAccountResponse } from "./handlers";

export const dynamic = "force-dynamic";

const MENU = "masters.bank_accounts";

/**
 * Masters → Company's Bank A/C (CM-701): the Company's Cash and Bank
 * accounts with today's balance and pending documents. Needs Company's
 * Bank A/C read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, MENU, "read");
    if (isResponse(session)) return session;
    const items = await handlers.list(session.access);
    const body: ListConstructionFinanceAccountsResponseModel = {
      items: items.map(toAccountResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds a Cash or Bank account with its opening balance (an opening entry
 * when not zero). Needs Company's Bank A/C create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionFinanceAccountRequestModel.safeParse(
        await request.json(),
      ),
    );
    const id = await handlers.create(session.access, model.kind, {
      ...model,
      openingBalance: BigInt(model.openingBalance),
    });
    return Response.json(
      toAccountResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
