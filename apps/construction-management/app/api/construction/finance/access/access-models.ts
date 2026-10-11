import { z } from "zod";

import { FLAGS } from "@/src/shared-kernel/access";

/** Optional Project the project-level menus are checked against. */
export const GetConstructionFinanceAccessRequestModel = z.object({
  projectId: z.uuid().optional(),
});

/** The finance menus a screen hides actions by (M7, ADR CM-0017 §14). */
export const FINANCE_ACCESS_MENUS = [
  "finance.central_payment",
  "finance.payments",
  "finance.transactions",
  "finance.parties",
  "finance.petty_cash",
  "finance.other_expenses",
  "masters.bank_accounts",
  "masters.payment_categories",
  "masters.other_parties",
  "masters.contractors",
  "masters.suppliers",
  "labour.labour",
  "labour.vendor",
] as const;
export type FinanceAccessMenu = (typeof FINANCE_ACCESS_MENUS)[number];

export const GetConstructionFinanceAccessResponseModel = z
  .object({
    projectId: z.uuid().nullable(),
    menus: z.record(z.enum(FINANCE_ACCESS_MENUS), z.array(z.enum(FLAGS))),
  })
  .meta({
    description:
      "For each finance menu, the flags the caller holds (on the Project when one is given and the menu is project-level). The UI hides what is missing; every route checks again.",
  });
export type GetConstructionFinanceAccessResponseModel = z.infer<
  typeof GetConstructionFinanceAccessResponseModel
>;
