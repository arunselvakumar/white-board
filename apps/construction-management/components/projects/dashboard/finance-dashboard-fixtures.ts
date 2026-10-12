import type { FinanceDashboard } from "@/src/queries/finance-dashboard";

/** Story data for the Project Dashboard's Payments section (CM-709). */

export const FINANCE_DASHBOARD_PATH = "/api/construction/finance/dashboard";

export const VELAN_ID = "0193a8f0-0000-7000-8000-00000000c001";
export const TRADERS_ID = "0193a8f0-0000-7000-8000-00000000c002";

/** Every month of the duration, with money in some of them. */
export function financeDashboard(from: string, to: string): FinanceDashboard {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  while (
    `${String(year)}-${String(month).padStart(2, "0")}` <= to.slice(0, 7)
  ) {
    months.push(`${String(year)}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  let balance = 2_00_000_00;
  const rows = months.map((key, index) => {
    const into = index % 3 === 1 ? 0 : 6_00_000_00 + index * 25_000_00;
    const out = 3_50_000_00 + ((index * 40_000_00) % 2_00_000_00);
    balance += into - out;
    return { month: key, in: into, out, net: into - out, balance };
  });
  const totalIn = rows.reduce((sum, row) => sum + row.in, 0);
  const totalOut = rows.reduce((sum, row) => sum + row.out, 0);
  return {
    payments: {
      months: rows,
      totals: { in: totalIn, out: totalOut, net: totalIn - totalOut },
      dues: [
        {
          partyType: "contractor",
          partyId: VELAN_ID,
          name: "Velan Constructions",
          invoiced: 21_40_000_00,
          paid: 14_00_000_00,
          due: 7_40_000_00,
          overdue: 2_15_000_00,
        },
        {
          partyType: "supplier",
          partyId: TRADERS_ID,
          name: "Sri Murugan Traders and Hardware Suppliers",
          invoiced: 3_85_000_00,
          paid: 2_00_000_00,
          due: 1_85_000_00,
          overdue: 0,
        },
      ],
      modules: {
        contractor: 14_00_000_00,
        supplier: 2_00_000_00,
        labour: 4_80_000_00,
        vendor: 1_20_000_00,
        other_party: 0,
        other_expense: 35_000_00,
      },
    },
    approvals: {
      transactions: 2,
      transfers: 1,
      vouchers: 3,
      otherExpenses: null,
      settlements: 1,
      total: 7,
    },
  };
}

/** No money on the Project yet. */
export function emptyFinanceDashboard(
  from: string,
  to: string,
): FinanceDashboard {
  const full = financeDashboard(from, to);
  return {
    payments: {
      months: (full.payments?.months ?? []).map((month) => ({
        month: month.month,
        in: 0,
        out: 0,
        net: 0,
        balance: 0,
      })),
      totals: { in: 0, out: 0, net: 0 },
      dues: [],
      modules: {
        contractor: 0,
        supplier: 0,
        labour: 0,
        vendor: 0,
        other_party: 0,
        other_expense: 0,
      },
    },
    approvals: {
      transactions: 0,
      transfers: 0,
      vouchers: 0,
      otherExpenses: 0,
      settlements: 0,
      total: 0,
    },
  };
}

/** Dashboard Read but neither Payments Read nor any Approve flag. */
export const NO_PAYMENTS: FinanceDashboard = {
  payments: null,
  approvals: {
    transactions: null,
    transfers: null,
    vouchers: null,
    otherExpenses: null,
    settlements: null,
    total: 0,
  },
};
