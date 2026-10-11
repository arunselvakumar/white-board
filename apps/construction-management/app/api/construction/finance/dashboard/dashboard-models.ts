import { z } from "zod";

export const FINANCE_DASHBOARD_PATH = "/api/construction/finance/dashboard";

/** Paise as a safe integer (rupees only on screen). */
const paise = z.int();

/** The Project Dashboard's payments read (CM-709): a Project and a duration. */
export const GetConstructionFinanceDashboardRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "From must be on or before To.",
    path: ["from"],
  });

const PARTY_TYPES = ["contractor", "supplier", "other_party"] as const;

export const GetConstructionFinanceDashboardResponseModel = z
  .object({
    /** Null without Payments (`finance.payments`) Read on the Project. */
    payments: z
      .object({
        /**
         * Every month of the duration: money into and out of accounts on
         * this Project (no openings, no transfers between the Company's
         * own accounts; a reversal nets out its entry), and the balance of
         * every in − out on the Project up to the month's end.
         */
        months: z.array(
          z.object({
            month: z.string().describe("YYYY-MM"),
            in: paise,
            out: paise,
            net: paise,
            balance: paise,
          }),
        ),
        totals: z.object({ in: paise, out: paise, net: paise }),
        /**
         * Parties with something due on bills from them on this Project,
         * on the duration's last day, the most due first.
         */
        dues: z.array(
          z.object({
            partyType: z.enum(PARTY_TYPES),
            partyId: z.uuid(),
            name: z.string(),
            invoiced: paise,
            /** Allocated (money and TDS) plus written off. */
            paid: paise,
            due: paise,
            overdue: paise,
          }),
        ),
        /** Money paid out on this Project in the duration, by module. */
        modules: z.object({
          contractor: paise,
          supplier: paise,
          labour: paise,
          vendor: paise,
          other_party: paise,
          other_expense: paise,
        }),
      })
      .nullable(),
    /**
     * Pending documents on this Project the caller may decide; a count is
     * null without that menu's Approve flag (Transactions for Transactions
     * and transfers, Petty Cash for vouchers, Other Expenses, Parties for
     * settlements).
     */
    approvals: z.object({
      transactions: z.int().nullable(),
      transfers: z.int().nullable(),
      vouchers: z.int().nullable(),
      otherExpenses: z.int().nullable(),
      settlements: z.int().nullable(),
      total: z.int(),
    }),
  })
  .meta({
    description:
      "The Project Dashboard's Payments section and Payment Approvals KPI (CM-709).",
  });
export type GetConstructionFinanceDashboardResponseModel = z.infer<
  typeof GetConstructionFinanceDashboardResponseModel
>;
