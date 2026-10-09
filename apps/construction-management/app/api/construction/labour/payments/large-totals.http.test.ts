import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getBalances } from "@/app/api/construction/labour/balances/route";
import { GET as getStatement } from "@/app/api/construction/labour/balances/statement/route";
import {
  GET as listLabours,
  POST as createLabour,
} from "@/app/api/construction/labour/labours/route";
import { GET as getSummary } from "@/app/api/construction/labour/summary/route";
import {
  GET as listVendors,
  POST as createVendor,
} from "@/app/api/construction/labour/vendors/route";
import type { NewLedgerEntry } from "@/src/labour/domain/ledger";
import { prismaLedger } from "@/src/labour/infrastructure/prisma-ledger";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
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
  partyType: "labour" | "vendor",
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
      partyType === "labour" ? "labour_attendance" : "vendor_attendance",
    sourceId: newId(),
    reversesEntryId: null,
  };
}

async function seed() {
  const company = await ownerWithCompany();
  const tower = await addProject(company.workspaceId, company.userId, "Tower");
  const labour = await json<{ id: string }>(
    await createLabour(
      jsonRequest(`${API}/labours`, company.cookie, {
        name: "Big Gang Leader",
        joiningDate: "2026-08-01",
        wageType: "daily",
        wagePerDay: 70_000,
        overtimeWagePerHour: 10_000,
        weeklyHolidays: [0],
        currentProjectId: tower,
        openingBalance: 0,
      }),
    ),
  );
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
      earned("labour", labour.id, tower, "2026-09-10"),
      earned("labour", labour.id, tower, "2026-09-11"),
      earned("labour", labour.id, tower, "2026-09-12"),
      earned("labour", labour.id, tower, "2026-09-13"),
      earned("vendor", vendor.id, tower, "2026-09-10"),
      earned("vendor", vendor.id, tower, "2026-09-11"),
    ]),
  );
  const pay = async (
    partyType: "labour" | "vendor",
    partyId: string,
    paymentDate: string,
  ) =>
    json<{ id: string }>(
      await recordPayment(
        jsonRequest(`${API}/payments`, company.cookie, {
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
  await pay("labour", labour.id, "2026-09-14");
  await pay("labour", labour.id, "2026-09-15");
  await pay("labour", labour.id, "2026-09-16");
  await pay("vendor", vendor.id, "2026-09-16");
  return { company, tower, labourId: labour.id, vendorId: vendor.id };
}

describe("amounts past ₹21.47 crore (32-bit) on one Project", () => {
  it("lists, balances, states and summarises exact bigint totals", async () => {
    const { company, tower, labourId, vendorId } = await seed();
    const labourBalance = 4 * CRORE_AND_A_HALF - 3 * ONE_CRORE;
    const vendorBalance = 2 * CRORE_AND_A_HALF - ONE_CRORE;
    expect(labourBalance).toBeGreaterThan(INT_MAX);

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
          `${API}/balances?projectId=${tower}&partyType=labour&kind=monthly&anchor=2026-09-15`,
          company.cookie,
        ),
      ),
    );
    expect(month.items.find((item) => item.partyId === labourId)).toMatchObject(
      {
        earned: 4 * CRORE_AND_A_HALF,
        paid: 3 * ONE_CRORE,
        finalAmount: labourBalance,
      },
    );
    expect(month.totals.finalAmount).toBe(labourBalance);

    const statement = await json<{ closingBalance: number }>(
      await getStatement(
        jsonRequest(
          `${API}/balances/statement?projectId=${tower}&partyType=labour&partyId=${labourId}&from=2026-09-01&to=2026-09-30`,
          company.cookie,
        ),
      ),
    );
    expect(statement.closingBalance).toBe(labourBalance);

    const summary = await json<{
      labourBalance: { toPay: number };
      vendorBalance: { toPay: number };
    }>(
      await getSummary(
        jsonRequest(
          `${API}/summary?projectId=${tower}&date=2026-09-30`,
          company.cookie,
        ),
      ),
    );
    expect(summary.labourBalance.toPay).toBe(labourBalance);
    expect(summary.vendorBalance.toPay).toBe(vendorBalance);

    const labours = await json<{ items: { id: string; balance: number }[] }>(
      await listLabours(jsonRequest(`${API}/labours`, company.cookie)),
    );
    expect(labours.items.find((item) => item.id === labourId)?.balance).toBe(
      labourBalance,
    );
    const vendors = await json<{ items: { id: string; balance: number }[] }>(
      await listVendors(jsonRequest(`${API}/vendors`, company.cookie)),
    );
    expect(vendors.items.find((item) => item.id === vendorId)?.balance).toBe(
      vendorBalance,
    );

    const balances = await prismaLedger.balances(
      prisma,
      company.workspaceId,
      "labour",
      [labourId],
      "2026-09-30",
    );
    expect(balances.get(labourId)).toBe(labourBalance);
  });

  it("refuses one payment above ₹2 crore with AMOUNT_TOO_LARGE", async () => {
    const { company, tower, labourId } = await seed();
    const response = await recordPayment(
      jsonRequest(`${API}/payments`, company.cookie, {
        partyType: "labour",
        partyId: labourId,
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
