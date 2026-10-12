import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { financeDirectory } from "@/src/composition/finance-directory";
import { FinanceDashboard } from "@/src/finance/infrastructure/finance-dashboard";
import { can, type Flag, type MenuKey } from "@/src/shared-kernel/access";

import { requestProjectId } from "../project-scope";
import {
  GetConstructionFinanceDashboardRequestModel,
  type GetConstructionFinanceDashboardResponseModel,
} from "./dashboard-models";

export const dynamic = "force-dynamic";

const dashboard = new FinanceDashboard(prisma, financeDirectory);

function paise(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A payment figure is beyond a safe integer.");
  return number;
}

/**
 * Payments on the Project Dashboard (CM-709), behind Dashboard Read on
 * the Project (ADR CM-0013 §12). The section itself needs Payments
 * (`finance.payments`) Read on the Project (ADR CM-0017 §14); each
 * Payment Approvals count needs its menu's Approve flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // The Project first, for the access check; the rest of the query is
    // validated only for a caller who may read it.
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
      { projectId: requestProjectId(query) },
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      GetConstructionFinanceDashboardRequestModel.safeParse(query),
    );
    const { access, workspaceId } = session;
    const scope = { projectId: model.projectId };
    const may = (menu: MenuKey, flag: Flag) => can(access, menu, flag, scope);

    const [payments, pending] = await Promise.all([
      may("finance.payments", "read")
        ? dashboard.payments(workspaceId, model.projectId, model)
        : null,
      dashboard.pendingApprovals(workspaceId, model.projectId),
    ]);
    const decides = may("finance.transactions", "approve");
    const approvals = {
      transactions: decides ? pending.transactions : null,
      transfers: decides ? pending.transfers : null,
      vouchers: may("finance.petty_cash", "approve") ? pending.vouchers : null,
      otherExpenses: may("finance.other_expenses", "approve")
        ? pending.otherExpenses
        : null,
      settlements: may("finance.parties", "approve")
        ? pending.settlements
        : null,
    };
    const body: GetConstructionFinanceDashboardResponseModel = {
      payments:
        payments == null
          ? null
          : {
              months: payments.months.map((month) => ({
                month: month.month,
                in: paise(month.in),
                out: paise(month.out),
                net: paise(month.net),
                balance: paise(month.balance),
              })),
              totals: {
                in: paise(payments.totals.in),
                out: paise(payments.totals.out),
                net: paise(payments.totals.net),
              },
              dues: payments.dues.map((due) => ({
                partyType: due.partyType,
                partyId: due.partyId,
                name: due.name,
                invoiced: paise(due.invoiced),
                paid: paise(due.paid),
                due: paise(due.due),
                overdue: paise(due.overdue),
              })),
              modules: {
                contractor: paise(payments.modules.contractor),
                supplier: paise(payments.modules.supplier),
                labour: paise(payments.modules.labour),
                vendor: paise(payments.modules.vendor),
                other_party: paise(payments.modules.other_party),
                other_expense: paise(payments.modules.other_expense),
              },
            },
      approvals: {
        ...approvals,
        total: Object.values(approvals).reduce<number>(
          (sum, count) => sum + (count ?? 0),
          0,
        ),
      },
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
