import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { scopeOf } from "@/src/finance/application/transaction-common";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  MENU,
  transactionHandlers as handlers,
  transactionRegister,
  toTransactionResponse,
  toTransferResponse,
} from "./handlers";
import {
  CreateConstructionFinanceTransactionRequestModel,
  ListConstructionFinanceTransactionsRequestModel,
  type ListConstructionFinanceTransactionsResponseModel,
} from "./transaction-models";

export const dynamic = "force-dynamic";

const Scope = z.object({ projectId: z.uuid().nullable().optional() });

/**
 * The Transactions register (CM-702): a Project's Transactions and
 * transfers (Transactions read on it), or, without `projectId`, every one
 * in the Company (Owner only, for Central Payment). Filters, cursors and
 * the in / out totals of what the filters match.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = parseOrThrow(Scope.safeParse(query)).projectId ?? null;
    const session: AccessSession | Response = await requireAccess(
      request,
      MENU,
      "read",
      scopeOf({ projectId }),
    );
    if (isResponse(session)) return session;
    if (projectId == null && session.access.role !== "owner")
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "Only the Owner sees every Project's Transactions. Open a Project's Payments instead.",
      );
    const model = parseOrThrow(
      ListConstructionFinanceTransactionsRequestModel.safeParse(query),
    );
    const page = await transactionRegister.list(session.access, {
      workspaceId: session.workspaceId,
      projectId,
      from: model.from,
      to: model.to,
      type: model.type,
      accountId: model.accountId,
      paymentCategoryId: model.paymentCategoryId,
      mode: model.mode,
      counterpartyKind: model.counterpartyKind,
      approvalStatus: model.approvalStatus,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0]?.item;
    const last = page.items.at(-1)?.item;
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionFinanceTransactionsResponseModel = {
      items: page.items.map((entry) =>
        entry.type === "transaction"
          ? toTransactionResponse(entry.item)
          : toTransferResponse(entry.item),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      totals: {
        in: Number(page.totals.in),
        out: Number(page.totals.out),
        transfer: Number(page.totals.transfer),
      },
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Records a Transaction (CM-702): pending, or approved with Save &
 * Approve (Approve needed), numbered TXN by the Project's rule. Needs
 * Transactions create on its Project (the flag alone for a Store or
 * Company-level one).
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
      CreateConstructionFinanceTransactionRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, {
      ...model,
      amount: BigInt(model.amount),
    });
    return Response.json(
      toTransactionResponse(await handlers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
