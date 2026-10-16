import type { MenuKey } from "@/src/shared-kernel/access";

/**
 * The modules of `construction_reporting.project_pending_approvals`
 * (CM-902, ADR CM-0021 §4): documents waiting for a decision on a Project.
 * Each counts for a member only with its menu's Approve flag on that
 * Project, as on the Project Dashboard (CM-510, CM-709).
 */
export const APPROVAL_MODULES = [
  "purchase_requests",
  "purchase_orders",
  "material_transfers",
  "worksheets",
  "equipment_usage_sheets",
  "transactions",
  "account_transfers",
  "petty_cash_vouchers",
  "other_expenses",
  "invoice_settlements",
] as const;

export type ApprovalModule = (typeof APPROVAL_MODULES)[number];

export function isApprovalModule(value: string): value is ApprovalModule {
  return (APPROVAL_MODULES as readonly string[]).includes(value);
}

/** The menu whose Approve flag decides each module's documents. */
export const APPROVAL_MODULE_MENUS: Record<ApprovalModule, MenuKey> = {
  purchase_requests: "procurement.purchase_requests",
  purchase_orders: "procurement.purchase_orders",
  material_transfers: "procurement.material_transfers",
  worksheets: "site_work.daily_worksheet",
  equipment_usage_sheets: "site_work.equipment_usage",
  // Transfers between accounts are decided on the Transactions menu.
  transactions: "finance.transactions",
  account_transfers: "finance.transactions",
  petty_cash_vouchers: "finance.petty_cash",
  other_expenses: "finance.other_expenses",
  invoice_settlements: "finance.parties",
};

/** Pending documents of one Project per module. */
export type ApprovalCounts = Record<ApprovalModule, number>;

export function noApprovals(): ApprovalCounts {
  return Object.fromEntries(
    APPROVAL_MODULES.map((module) => [module, 0]),
  ) as ApprovalCounts;
}

/** Whether the member may decide a module's documents on the Project. */
export type MayApprove = (module: ApprovalModule) => boolean;

const shown = (
  counts: ApprovalCounts,
  may: MayApprove,
  module: ApprovalModule,
) => (may(module) ? counts[module] : null);

function total(parts: readonly (number | null)[]): number {
  return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
}

/**
 * The Material Approvals tile (CM-510): pending Purchase Requests,
 * Purchase Orders and Material Transfers out of the Project; a count is
 * null without its Approve flag.
 */
export function materialApprovals(counts: ApprovalCounts, may: MayApprove) {
  const parts = {
    purchaseRequests: shown(counts, may, "purchase_requests"),
    purchaseOrders: shown(counts, may, "purchase_orders"),
    transfers: shown(counts, may, "material_transfers"),
  };
  return { ...parts, total: total(Object.values(parts)) };
}

/**
 * The Payment Approvals tile (CM-709): pending Transactions and transfers
 * (Transactions' Approve), petty-cash vouchers, Other Expenses and
 * settlements of the Project's invoices (Parties' Approve).
 */
export function paymentApprovals(counts: ApprovalCounts, may: MayApprove) {
  const parts = {
    transactions: shown(counts, may, "transactions"),
    transfers: shown(counts, may, "account_transfers"),
    vouchers: shown(counts, may, "petty_cash_vouchers"),
    otherExpenses: shown(counts, may, "other_expenses"),
    settlements: shown(counts, may, "invoice_settlements"),
  };
  return { ...parts, total: total(Object.values(parts)) };
}

/**
 * Every pending document on the Project the member may decide, worksheets
 * and equipment usage sheets included (the Company Dashboard); null when
 * they may approve none of the modules there.
 */
export function approvalsWaiting(
  counts: ApprovalCounts,
  may: MayApprove,
): number | null {
  const allowed = APPROVAL_MODULES.filter(may);
  if (allowed.length === 0) return null;
  return allowed.reduce((sum, module) => sum + counts[module], 0);
}
