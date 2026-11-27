import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getBalances } from "@/app/api/construction/labour/balances/route";
import { GET as getStatement } from "@/app/api/construction/labour/balances/statement/route";
import { GET as getSummary } from "@/app/api/construction/labour/summary/route";
import {
  GET as listVendors,
  POST as createVendor,
} from "@/app/api/construction/labour/vendors/route";
import type { NewLedgerEntry } from "@/src/labour/domain/ledger";
import { prismaLedger } from "@/src/labour/infrastructure/prisma-ledger";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { seedEmployee } from "@/test/employees";
import { seededAccounts } from "@/test/finance";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as listPayments, POST as recordPayment } from "./route";

const API = `${TEST_ORIGIN}/api/construction/labour`;

/** ₹1 crore and ₹1.5 crore in paise: each row fits an `integer`, the sums do not. */
const ONE_CRORE = 1_000_000_000;
const CRORE_AND_A_HALF = 1_500_000_000;
const INT_MAX = 2_147_483_647;

async function json<T>(response: Response): Promise<T> {
  expect(response.status).toBeLessThan(300);
  return (await response.json()) as T;
}

function earned(
  partyType: "employee" | "vendor",
  partyId: string,
  projectId: string,
  entryDate: string,
): NewLedgerEntry {
  return {
    partyType,
    partyId,
    projectId,
    entryDate,
    kind: "earned",
    amount: CRORE_AND_A_HALF,
    sourceType:
      partyType === "employee" ? "employee_attendance" : "vendor_attendance",
    sourceId: newId(),
    reversesEntryId: null,
  };
}

async function seed() {
  const company = await ownerWithCompany();
  const tower = await addProject(company.workspaceId, company.userId, "Tower");
  const labour = {
    id: await seedEmployee({
      workspaceId: company.workspaceId,
      name: "Big Gang Leader",
      joiningDate: "2026-08-01",
      wagePerDay: 70_000,
      overtimeWagePerHour: 10_000,
      weeklyHolidays: [0],
      projectIds: [tower],
    }),
  };
  const vendor = await json<{ id: string }>(
    await createVendor(
      jsonRequest(`${API}/vendors`, company.cookie, {
        name: "Big Vendor",
        joiningDate: "2026-08-01",
        projectIds: [tower],
        shifts: [],
        openingBalance: 0,
      }),
    ),
  );
  // Four days of ₹1.5 crore wages for the labourer, two for the vendor.
  await prisma.$transaction((tx) =>
    prismaLedger.post(tx, company.workspaceId, company.userId, [
      earned("employee", labour.id, tower, "2026-09-10"),
      earned("employee", labour.id, tower, "2026-09-11"),
      earned("employee", labour.id, tower, "2026-09-12"),
      earned("employee", labour.id, tower, "2026-09-13"),
      earned("vendor", vendor.id, tower, "2026-09-10"),
      earned("vendor", vendor.id, tower, "2026-09-11"),
    ]),
  );
  const { bankId } = await seededAccounts(company.workspaceId);
  const pay = async (
    partyType: "employee" | "vendor",
    partyId: string,
    paymentDate: string,
  ) =>
    json<{ id: string }>(
      await recordPayment(
        jsonRequest(`${API}/payments`, company.cookie, {
          accountId: bankId,
          partyType,
          partyId,
          projectId: tower,
          paymentDate,
          kind: "payment",
          mode: "bank",
          amount: ONE_CRORE,
        }),
      ),
    );
  // ₹3 crore to the labourer, ₹1 crore to the vendor: past the `integer` max.
  await pay("employee", labour.id, "2026-09-14");
  await pay("employee", labour.id, "2026-09-15");
  await pay("employee", labour.id, "2026-09-16");
  await pay("vendor", vendor.id, "2026-09-16");
  return { company, tower, employeeId: labour.id, vendorId: vendor.id };
}

describe("amounts past ₹21.47 crore (32-bit) on one Project", () => {
  it("lists, balances, states and summarises exact bigint totals", async () => {
    const { company, tower, employeeId, vendorId } = await seed();
    const employeeBalance = 4 * CRORE_AND_A_HALF - 3 * ONE_CRORE;
    const vendorBalance = 2 * CRORE_AND_A_HALF - ONE_CRORE;
    expect(employeeBalance).toBeGreaterThan(INT_MAX);

    const payments = await json<{ total: number; totalAmount: number }>(
      await listPayments(
        jsonRequest(`${API}/payments?projectId=${tower}`, company.cookie),
      ),
    );
    expect(payments.total).toBe(4);
    expect(payments.totalAmount).toBe(4 * ONE_CRORE);

    type Summary = { earned: number; paid: number; finalAmount: number };
    const month = await json<{
      items: (Summary & { partyId: string })[];
      totals: Summary;
    }>(
      await getBalances(
        jsonRequest(
          `${API}/balances?projectId=${tower}&partyType=employee&kind=monthly&anchor=2026-09-15`,
          company.cookie,
        ),
      ),
    );
    expect(
      month.items.find((item) => item.partyId === employeeId),
    ).toMatchObject({
      earned: 4 * CRORE_AND_A_HALF,
      paid: 3 * ONE_CRORE,
      finalAmount: employeeBalance,
    });
    expect(month.totals.finalAmount).toBe(employeeBalance);

    const statement = await json<{ closingBalance: number }>(
      await getStatement(
        jsonRequest(
          `${API}/balances/statement?projectId=${tower}&partyType=employee&partyId=${employeeId}&from=2026-09-01&to=2026-09-30`,
          company.cookie,
        ),
      ),
    );
    expect(statement.closingBalance).toBe(employeeBalance);

    const summary = await json<{
      employeeBalance: { toPay: number };
      vendorBalance: { toPay: number };
    }>(
      await getSummary(
        jsonRequest(
          `${API}/summary?projectId=${tower}&date=2026-09-30`,
          company.cookie,
        ),
      ),
    );
    expect(summary.employeeBalance.toPay).toBe(employeeBalance);
    expect(summary.vendorBalance.toPay).toBe(vendorBalance);

    const vendors = await json<{ items: { id: string; balance: number }[] }>(
      await listVendors(jsonRequest(`${API}/vendors`, company.cookie)),
    );
    expect(vendors.items.find((item) => item.id === vendorId)?.balance).toBe(
      vendorBalance,
    );

    const balances = await prismaLedger.balances(
      prisma,
      company.workspaceId,
      "employee",
      [employeeId],
      "2026-09-30",
    );
    expect(balances.get(employeeId)).toBe(employeeBalance);
  });

  it("refuses one payment above ₹2 crore with AMOUNT_TOO_LARGE", async () => {
    const { company, tower, employeeId } = await seed();
    const { bankId } = await seededAccounts(company.workspaceId);
    const response = await recordPayment(
      jsonRequest(`${API}/payments`, company.cookie, {
        accountId: bankId,
        partyType: "employee",
        partyId: employeeId,
        projectId: tower,
        paymentDate: "2026-09-20",
        kind: "advance",
        mode: "bank",
        amount: INT_MAX + 1,
      }),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(((await response.json()) as { code: string }).code).toBe(
      "AMOUNT_TOO_LARGE",
    );
  });
});
