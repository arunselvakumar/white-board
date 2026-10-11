import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { scopeOf } from "@/src/finance/application/transaction-common";

import {
  MENU,
  transferHandlers as handlers,
  toTransferResponse,
} from "../transactions/handlers";
import { CreateConstructionFinanceTransferRequestModel } from "../transactions/transaction-models";

export const dynamic = "force-dynamic";

const Scope = z.object({ projectId: z.uuid().nullable().optional() });

/**
 * Records a transfer between two accounts (CM-702): pending, or approved
 * with Save & Approve, numbered TXN. The mode must fit the from account,
 * which the caller must be able to use. Transactions create on its
 * Project (the flag alone without one).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const projectId = parseOrThrow(Scope.safeParse(raw)).projectId ?? null;
    const session = await requireAccess(
      request,
      MENU,
      "create",
      scopeOf({ projectId }),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionFinanceTransferRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, {
      ...model,
      amount: BigInt(model.amount),
    });
    return Response.json(
      toTransferResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
