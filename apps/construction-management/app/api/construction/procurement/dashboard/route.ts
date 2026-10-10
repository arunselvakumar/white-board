import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireAccess } from "@/app/api/_lib/require-access";
import { procurementDirectory } from "@/src/composition/procurement-directory";
import { ProcurementDashboard } from "@/src/procurement/infrastructure/procurement-dashboard";
import { can } from "@/src/shared-kernel/access";

import {
  GetConstructionProcurementDashboardRequestModel,
  type GetConstructionProcurementDashboardResponseModel,
} from "./dashboard-models";

export const dynamic = "force-dynamic";

const dashboard = new ProcurementDashboard(prisma, procurementDirectory);

function paise(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A purchase order total is beyond a safe integer.");
  return number;
}

/**
 * Materials on the Project Dashboard (CM-510), behind its Read on the
 * Project. Each part also needs its own menu: Current Inventory read for
 * the stock states, Purchase Order read for PO figures, and each
 * document's Approve flag for its pending count.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionProcurementDashboardRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const { access, workspaceId } = session;
    const scope = { projectId: model.projectId };
    const may = (
      menu: Parameters<typeof can>[1],
      flag: Parameters<typeof can>[2],
    ) => can(access, menu, flag, scope);

    const [materials, orders, pending] = await Promise.all([
      may("procurement.current_inventory", "read")
        ? dashboard.materialSummary(workspaceId, model.projectId)
        : null,
      may("procurement.purchase_orders", "read")
        ? dashboard.purchaseOrders(
            workspaceId,
            model.projectId,
            model.from,
            model.to,
          )
        : null,
      dashboard.pendingApprovals(workspaceId, model.projectId),
    ]);
    const approvals = {
      purchaseRequests: may("procurement.purchase_requests", "approve")
        ? pending.purchaseRequests
        : null,
      purchaseOrders: may("procurement.purchase_orders", "approve")
        ? pending.purchaseOrders
        : null,
      transfers: may("procurement.material_transfers", "approve")
        ? pending.transfers
        : null,
    };
    const body: GetConstructionProcurementDashboardResponseModel = {
      materials,
      purchaseOrders:
        orders == null
          ? null
          : {
              count: orders.count,
              value: paise(orders.value),
              months: orders.months.map((month) => ({
                month: month.month,
                value: paise(month.value),
              })),
            },
      approvals: {
        ...approvals,
        total:
          (approvals.purchaseRequests ?? 0) +
          (approvals.purchaseOrders ?? 0) +
          (approvals.transfers ?? 0),
      },
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
