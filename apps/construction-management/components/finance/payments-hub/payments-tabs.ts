import type { FinanceAccessMenu } from "@/app/api/construction/finance/access/access-models";

/**
 * The tabs of a Project's Payments module (M2's wages, then M7), in order.
 * `segment` is the path under `/app/projects/<id>/payments/`; a tab shows
 * when the viewer has Read on any of its menus (ADR CM-0017 §14).
 */
export const PAYMENTS_TABS = [
  {
    segment: "contractors",
    label: "Contractors",
    menus: ["finance.parties"],
  },
  { segment: "suppliers", label: "Suppliers", menus: ["finance.parties"] },
  {
    segment: "other-parties",
    label: "Other Parties",
    menus: ["finance.parties"],
  },
  {
    segment: "wages",
    label: "Labour & Vendor",
    menus: ["labour.labour", "labour.vendor"],
  },
  {
    segment: "transactions",
    label: "Transactions",
    menus: ["finance.transactions"],
  },
  { segment: "petty-cash", label: "Petty Cash", menus: ["finance.petty_cash"] },
  {
    segment: "other-expenses",
    label: "Other Expenses",
    menus: ["finance.other_expenses"],
  },
] as const satisfies readonly {
  segment: string;
  label: string;
  menus: readonly FinanceAccessMenu[];
}[];

export type PaymentsTabSegment = (typeof PAYMENTS_TABS)[number]["segment"];

export function paymentsPath(
  projectId: string,
  segment: PaymentsTabSegment,
): string {
  return `/app/projects/${encodeURIComponent(projectId)}/payments/${segment}`;
}
