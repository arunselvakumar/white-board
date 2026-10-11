import { z } from "zod";

export const CENTRAL_PAYMENT_PATH = "/api/construction/finance/central-payment";

/** Paise as a safe integer (rupees only on screen). */
const paise = z.int();

const PartyDueModel = z.object({
  partyId: z.uuid(),
  name: z.string(),
  /** Projects in scope with this party's money. */
  projectCount: z.int(),
  /** Bills from the party. */
  invoiced: paise,
  /** Allocated to those bills (money and TDS) plus written off. */
  paid: paise,
  due: paise,
  /** Due on bills past their due date. */
  overdue: paise,
  /** Payments out not yet allocated to a bill (money and TDS). */
  advance: paise,
  /** Left on sales invoices to the party (Other Parties only). */
  receivable: paise,
  /** + the Company owes the party; − the party owes the Company or holds an advance. */
  balance: paise,
});

export const GetConstructionFinanceCentralPaymentResponseModel = z
  .object({
    /** The Company's today: dues and balances are on this day. */
    asOn: z.iso.date(),
    /** Every Project and Store (the Owner), or only the caller's Projects. */
    allProjects: z.boolean(),
    projectCount: z.int(),
    /** Parties with money on the Projects in scope, the most due first. */
    parties: z.object({
      contractor: z.array(PartyDueModel),
      supplier: z.array(PartyDueModel),
      other_party: z.array(PartyDueModel),
    }),
    /** Company Cash and Bank accounts; null without Company's Bank A/C Read. */
    accounts: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          kind: z.enum(["cash", "bank"]),
          isPrimary: z.boolean(),
          bankName: z.string().nullable(),
          accountLast4: z.string().nullable(),
          balance: paise,
          pendingTotal: paise,
          pendingCount: z.int(),
        }),
      )
      .nullable(),
    /**
     * Petty-cash accounts; null without Petty Cash Read. Without View all
     * only the caller's own.
     */
    pettyCash: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          holderName: z.string(),
          isOwn: z.boolean(),
          balance: paise,
          pendingTotal: paise,
          pendingCount: z.int(),
          lastVoucherDate: z.iso.date().nullable(),
        }),
      )
      .nullable(),
    /** Which central reports the caller may run. */
    reports: z.object({
      /** Company's Bank A/C Report (company accounts) or Petty Cash Report (petty cash). */
      ledger: z.object({ company: z.boolean(), pettyCash: z.boolean() }),
      tds194c: z.boolean(),
      duePayments: z.boolean(),
    }),
  })
  .meta({
    description:
      "Central Payment (CM-709): party dues across Projects, company account balances, petty-cash accounts and the central reports the caller may run.",
  });
export type GetConstructionFinanceCentralPaymentResponseModel = z.infer<
  typeof GetConstructionFinanceCentralPaymentResponseModel
>;
