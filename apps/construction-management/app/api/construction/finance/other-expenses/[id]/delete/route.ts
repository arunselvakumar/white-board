import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  otherExpenseHandlers as handlers,
  requireOtherExpenseAccess,
} from "../../handlers";
import {
  ConstructionFinanceOtherExpenseParamsModel,
  DeleteConstructionFinanceOtherExpenseRequestModel,
} from "../../other-expense-models";

export const dynamic = "force-dynamic";

/** Deletes an Other Expense; an approved one has its account entry reversed (CM-704). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceOtherExpenseParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireOtherExpenseAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionFinanceOtherExpenseRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
