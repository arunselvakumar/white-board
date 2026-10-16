import type { AccessSession } from "@/app/api/_lib/require-access";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { financeAuthorNames } from "@/src/composition/finance-author-names";
import { financeDirectory } from "@/src/composition/finance-directory";
import { messagingEvents } from "@/src/composition/messaging";
import {
  OTHER_EXPENSE_MENU,
  type StoredOtherExpense,
} from "@/src/finance/application/other-expense-handlers";
import { createOtherExpenseHandlers } from "@/src/finance/infrastructure/other-expense-store";
import type { Flag } from "@/src/shared-kernel/access";

import { toOtherExpenseResponse } from "./other-expense-models";

export { OTHER_EXPENSE_MENU };

/** One set of Other Expense handlers for every route (CM-704). */
export const otherExpenseHandlers = createOtherExpenseHandlers({
  directory: financeDirectory,
  authors: financeAuthorNames(),
  events: messagingEvents(),
});

/**
 * The Session plus the Permission Matrix check for a route about one
 * expense: it is loaded first (404 for another Company's or a deleted
 * one), then `flag` is checked on its Project.
 */
export async function requireOtherExpenseAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredOtherExpense }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await otherExpenseHandlers.find(session.workspaceId, id);
  const access = await requireAccess(request, OTHER_EXPENSE_MENU, flag, {
    projectId: target.projectId,
  });
  if (isResponse(access)) return access;
  return { ...access, target };
}

/** The expense as the routes answer it. */
export async function expenseResponse(session: AccessSession, id: string) {
  const { model, actions } = await otherExpenseHandlers.get(session.access, id);
  return toOtherExpenseResponse(model, actions);
}
