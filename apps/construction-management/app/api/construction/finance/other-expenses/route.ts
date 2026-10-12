import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/site-work/project-scope";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  expenseResponse,
  OTHER_EXPENSE_MENU,
  otherExpenseHandlers as handlers,
} from "./handlers";
import {
  CreateConstructionFinanceOtherExpenseRequestModel,
  ListConstructionFinanceOtherExpensesRequestModel,
  toOtherExpenseResponse,
  toTotalsResponse,
  type ListConstructionFinanceOtherExpensesResponseModel,
} from "./other-expense-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Other Expenses, newest recorded first, by date range,
 * Payment Category, account and status, with the totals of every match
 * (CM-704). Needs Other Expenses read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireAccess(request, OTHER_EXPENSE_MENU, "read", {
      projectId: requestProjectId(query),
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinanceOtherExpensesRequestModel.safeParse(query),
    );
    const page = await handlers.list(session.access, {
      projectId: model.projectId,
      from: model.from,
      to: model.to,
      paymentCategoryId: model.paymentCategoryId,
      accountId: model.accountId,
      status: model.status,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0]?.model;
    const last = page.items.at(-1)?.model;
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionFinanceOtherExpensesResponseModel = {
      items: page.items.map((item) =>
        toOtherExpenseResponse(item.model, item.actions),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      totals: toTotalsResponse(page.totals),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Records an Other Expense (CM-704): numbered EXP on its date, pending, or
 * approved with Save & Approve (needs Approve), which posts its account
 * entry at once. Needs Other Expenses create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireAccess(request, OTHER_EXPENSE_MENU, "create", {
      projectId: requestProjectId(raw),
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionFinanceOtherExpenseRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, model);
    return Response.json(await expenseResponse(session, id), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
