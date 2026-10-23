import { BOQ_MENU } from "@/src/contracts/application/boq-ports";
import { CLIENT_BILL_MENU } from "@/src/contracts/application/client-bill-ports";
import { CONTRACTOR_BILL_MENU } from "@/src/contracts/application/contractor-bill-ports";
import { WORK_ORDER_MENU } from "@/src/contracts/application/work-order-ports";
import { can, type MemberAccess } from "@/src/shared-kernel/access";

import { boqHandlers } from "./contracts-boq";
import { clientBillHandlers } from "./contracts-client-bills";
import { contractorBillHandlers } from "./contracts-contractor-bills";
import { workOrderHandlers } from "./contracts-work-orders";

/** One side of the Contracts section; money is null without its Financial. */
export type ContractsDashboardSide = {
  /** Paise: Σ gross of the approved RA bills (escalation bills not counted). */
  billedToDate: bigint | null;
  /** Paise still receivable (client) or payable (contractor) on approved bills and releases. */
  outstanding: bigint | null;
  /** Paise of retention held on approved bills, less releases. */
  retentionHeld: bigint | null;
  /** RA and escalation bills waiting for approval. */
  pendingApproval: number;
};

export type ContractsDashboard = {
  /** Null without BOQ read; `value` null without BOQ Financial. */
  boq: { value: bigint | null } | null;
  /** Null without Client Bills read. */
  client: ContractsDashboardSide | null;
  /** Null without Contractor Bills read. */
  contractor: ContractsDashboardSide | null;
  /** Null without Work Order read. */
  workOrders: { open: number } | null;
};

/**
 * The Project Dashboard's Contracts section (CM-1111): each figure is
 * what its list or page shows, read through the same handlers — BOQ
 * total, the approved RA bills' gross on each side, retention held,
 * bills pending approval and issued Work Orders — plus what finance still
 * shows due on the bills' invoices. A part is null without its menu's
 * read, and money is null without its Financial. As on today: the
 * dashboard duration does not apply.
 */
export async function readContractsDashboard(
  access: MemberAccess,
  projectId: string,
): Promise<ContractsDashboard> {
  const scope = { projectId };
  const may = (menu: Parameters<typeof can>[1]) =>
    can(access, menu, "read", scope);
  const pending = { status: "pending_approval", limit: 1 } as const;
  const approvedRa = {
    status: "approved",
    type: "running",
    limit: 1,
  } as const;

  const [boq, client, contractor, workOrders] = await Promise.all([
    may(BOQ_MENU)
      ? boqHandlers.boq(access, projectId).then((view) => ({
          value: view.financial ? view.total : null,
        }))
      : null,
    may(CLIENT_BILL_MENU)
      ? Promise.all([
          clientBillHandlers.list(access, projectId, approvedRa),
          clientBillHandlers.list(access, projectId, pending),
          clientBillHandlers.outstanding(access, projectId),
        ]).then(([approved, waiting, outstanding]) => {
          const money = <T>(value: T) => (approved.financial ? value : null);
          return {
            billedToDate: money(approved.totals.gross),
            outstanding: money(outstanding),
            retentionHeld: money(approved.retentionReceivable),
            pendingApproval: waiting.total,
          };
        })
      : null,
    may(CONTRACTOR_BILL_MENU)
      ? Promise.all([
          contractorBillHandlers.list(access, projectId, approvedRa),
          contractorBillHandlers.list(access, projectId, pending),
          contractorBillHandlers.outstanding(access, projectId),
        ]).then(([approved, waiting, outstanding]) => {
          const money = <T>(value: T) => (approved.financial ? value : null);
          return {
            billedToDate: money(approved.totals.gross),
            outstanding: money(outstanding),
            retentionHeld: money(
              approved.retentionHeld.reduce((sum, row) => sum + row.amount, 0n),
            ),
            pendingApproval: waiting.total,
          };
        })
      : null,
    may(WORK_ORDER_MENU)
      ? workOrderHandlers
          .list(access, projectId, { status: "issued", limit: 1 })
          .then((page) => ({ open: page.total }))
      : null,
  ]);
  return { boq, client, contractor, workOrders };
}
