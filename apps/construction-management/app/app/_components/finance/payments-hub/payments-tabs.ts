import type { FinanceAccessMenu } from "@/app/api/construction/finance/access/access-models";
import { type AppHref, pageHref } from "@/lib/page-href";

/**
 * The tabs of a Project's Payments module, in order. `segment` is the path
 * under `/app/projects/<id>/payments/`; a tab shows when the viewer has Read on
 * any of its menus (ADR CM-0017 §14).
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

/** Each tab's page, named by its folder (ADR CM-0045). */
const PAYMENTS_TAB_PAGES: Record<PaymentsTabSegment, (id: string) => AppHref> =
  {
    contractors: (id) =>
      pageHref("/app/projects/[id]/payments/contractors", { id }),
    suppliers: (id) =>
      pageHref("/app/projects/[id]/payments/suppliers", { id }),
    "other-parties": (id) =>
      pageHref("/app/projects/[id]/payments/other-parties", { id }),
    wages: (id) => pageHref("/app/projects/[id]/payments/wages", { id }),
    transactions: (id) =>
      pageHref("/app/projects/[id]/payments/transactions", { id }),
    "petty-cash": (id) =>
      pageHref("/app/projects/[id]/payments/petty-cash", { id }),
    "other-expenses": (id) =>
      pageHref("/app/projects/[id]/payments/other-expenses", { id }),
  };

export function paymentsPath(
  projectId: string,
  segment: PaymentsTabSegment,
): AppHref {
  return PAYMENTS_TAB_PAGES[segment](projectId);
}
