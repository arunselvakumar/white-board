import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { projectDashboardKpis } from "@/src/composition/dashboard-reads";
import { financeDirectory } from "@/src/composition/finance-directory";
import {
  nameOfParty,
  partyNames,
} from "@/src/finance/infrastructure/due-invoices";
import { FinanceDashboard } from "@/src/finance/infrastructure/finance-dashboard";
import { can, type Flag, type MenuKey } from "@/src/shared-kernel/access";

import { requestProjectId } from "../project-scope";
import {
  GetConstructionFinanceDashboardRequestModel,
  type GetConstructionFinanceDashboardResponseModel,
} from "./dashboard-models";

export const dynamic = "force-dynamic";

const dashboard = new FinanceDashboard(prisma, financeDirectory);
const kpis = projectDashboardKpis();

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
 * Payment Approvals count needs its menu's Approve flag. Due Payments and
 * the pending counts come from the reporting views (`party_dues_on`,
 * `project_pending_approvals`, CM-902).
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

    const reads = may("finance.payments", "read");
    const [payments, dues, approvals] = await Promise.all([
      reads ? dashboard.payments(workspaceId, model.projectId, model) : null,
      reads ? kpis.duePayments(workspaceId, model.projectId, model.to) : null,
      kpis.paymentApprovals(access, model.projectId),
    ]);
    const names =
      dues == null
        ? new Map<string, string>()
        : await partyNames(prisma, financeDirectory, workspaceId, dues);
    const shownDues = (dues ?? [])
      .map((due) => ({
        partyType: due.partyType,
        partyId: due.partyId,
        name: nameOfParty(names, due),
        invoiced: paise(due.invoiced),
        paid: paise(due.paid + due.writtenOff),
        due: paise(due.due),
        overdue: paise(due.overdue),
      }))
      .sort((a, b) =>
        b.due === a.due ? a.name.localeCompare(b.name) : b.due - a.due,
      );
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
              dues: shownDues,
              modules: {
                contractor: paise(payments.modules.contractor),
                supplier: paise(payments.modules.supplier),
                labour: paise(payments.modules.labour),
                vendor: paise(payments.modules.vendor),
                other_party: paise(payments.modules.other_party),
                other_expense: paise(payments.modules.other_expense),
              },
            },
      approvals,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
