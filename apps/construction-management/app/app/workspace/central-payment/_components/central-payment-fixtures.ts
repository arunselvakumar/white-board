import type { ApiCall } from "../../../.storybook/mocks/api";
import { financeLookupsHandler } from "@/components/finance/account-fixtures";
import { catalogueHandler } from "@/components/reports/report-fixtures";
import type { CentralPaymentSummary } from "@/src/queries/finance-central-payment";
import type { ReportJob } from "@/src/queries/reports";

/** Story data for Workspace → Central Payment (CM-709). */

export const CENTRAL_PAYMENT_API = "/api/construction/finance/central-payment";
export const REPORTS_API = "/api/construction/reporting/reports";
export const TODAY = "2026-10-11";

export const CASH_ID = "0199b000-0000-7000-8000-0000000000a1";
export const BANK_ID = "0199b000-0000-7000-8000-0000000000a2";
export const PETTY_ID = "0199b000-0000-7000-8000-0000000000a3";

export function centralSummary(
  overrides: Partial<CentralPaymentSummary> = {},
): CentralPaymentSummary {
  return {
    asOn: TODAY,
    allProjects: true,
    projectCount: 3,
    parties: {
      contractor: [
        {
          partyId: "0199b000-0000-7000-8000-0000000000c1",
          name: "Velan Constructions",
          projectCount: 2,
          invoiced: 42_80_000_00,
          paid: 30_00_000_00,
          due: 12_80_000_00,
          overdue: 4_15_000_00,
          advance: 50_000_00,
          receivable: 0,
          balance: 12_30_000_00,
        },
        {
          partyId: "0199b000-0000-7000-8000-0000000000c2",
          name: "Sri Murugan Builders and Formwork Contractors",
          projectCount: 1,
          invoiced: 6_00_000_00,
          paid: 6_00_000_00,
          due: 0,
          overdue: 0,
          advance: 1_00_000_00,
          receivable: 0,
          balance: -1_00_000_00,
        },
      ],
      supplier: [
        {
          partyId: "0199b000-0000-7000-8000-0000000000c3",
          name: "Chennai Cements",
          projectCount: 3,
          invoiced: 8_45_000_00,
          paid: 5_00_000_00,
          due: 3_45_000_00,
          overdue: 0,
          advance: 0,
          receivable: 0,
          balance: 3_45_000_00,
        },
      ],
      other_party: [
        {
          partyId: "0199b000-0000-7000-8000-0000000000c4",
          name: "Flat buyer — Unit A-402",
          projectCount: 1,
          invoiced: 0,
          paid: 0,
          due: 0,
          overdue: 0,
          advance: 0,
          receivable: 5_00_000_00,
          balance: -5_00_000_00,
        },
      ],
    },
    accounts: [
      {
        id: CASH_ID,
        name: "Company's Cash Account",
        kind: "cash",
        isPrimary: true,
        bankName: null,
        accountLast4: null,
        balance: 1_25_400_00,
        pendingTotal: -12_000_00,
        pendingCount: 2,
      },
      {
        id: BANK_ID,
        name: "Company's Bank Account",
        kind: "bank",
        isPrimary: false,
        bankName: "State Bank of India",
        accountLast4: "4821",
        balance: -2_40_000_00,
        pendingTotal: 0,
        pendingCount: 0,
      },
    ],
    pettyCash: [
      {
        id: PETTY_ID,
        name: "Petty cash — Ravi Kumar",
        holderName: "Ravi Kumar",
        isOwn: false,
        balance: 8_450_00,
        pendingTotal: -1_200_00,
        pendingCount: 1,
        lastVoucherDate: "2026-10-09",
      },
    ],
    reports: {
      ledger: { company: true, pettyCash: true },
      tds194c: true,
      duePayments: true,
    },
    ...overrides,
  };
}

/** A member on one Project with Central payment Read only. */
export const MEMBER_SUMMARY = centralSummary({
  allProjects: false,
  projectCount: 1,
  accounts: null,
  pettyCash: null,
  reports: {
    ledger: { company: false, pettyCash: false },
    tds194c: false,
    duePayments: false,
  },
});

/** A new Company: nothing owed, the two seeded accounts at zero. */
export const EMPTY_SUMMARY = centralSummary({
  projectCount: 0,
  parties: { contractor: [], supplier: [], other_party: [] },
  accounts: [],
  pettyCash: [],
});

export function ledgerJob(accountId: string): ReportJob {
  const id = "0199b000-0000-7000-8000-0000000000e1";
  return {
    id,
    kind: "account_ledger",
    title: "Ledger",
    projectId: null,
    params: { from: "2026-10-01", to: TODAY, accountId },
    status: "done",
    includesMoney: true,
    error: null,
    requestedBy: "user-1",
    createdAt: "2026-10-11T05:30:00.000Z",
    startedAt: "2026-10-11T05:30:00.100Z",
    finishedAt: "2026-10-11T05:30:01.000Z",
    downloads: {
      xlsx: `${REPORTS_API}/${id}/download?format=xlsx`,
      pdf: `${REPORTS_API}/${id}/download?format=pdf`,
    },
  };
}

/** Answers Central Payment, its report list and lookups; Generate answers a Ledger. */
export function centralPaymentHandler(
  summary: CentralPaymentSummary = centralSummary(),
): (call: ApiCall) => Response | undefined {
  return (call) => {
    if (call.method === "GET" && call.path === CENTRAL_PAYMENT_API)
      return Response.json(summary);
    if (call.method === "GET" && call.path === REPORTS_API)
      return Response.json({ items: [] });
    if (call.method === "POST" && call.path === REPORTS_API) {
      const body = call.body as { params: { accountId?: string } };
      return Response.json(ledgerJob(body.params.accountId ?? CASH_ID), {
        status: 201,
      });
    }
    return catalogueHandler()(call) ?? financeLookupsHandler(call);
  };
}
