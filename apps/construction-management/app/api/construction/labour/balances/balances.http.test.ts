import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createLabour } from "@/app/api/construction/labour/labours/route";
import { POST as cancelPayment } from "@/app/api/construction/labour/payments/[id]/cancel/route";
import { POST as recordPayment } from "@/app/api/construction/labour/payments/route";
import { POST as createVendor } from "@/app/api/construction/labour/vendors/route";
import {
  period,
  summarize,
  type NewLedgerEntry,
} from "@/src/labour/domain/ledger";
import { prismaLedger } from "@/src/labour/infrastructure/prisma-ledger";
import type { Flag } from "@/src/shared-kernel/access";
import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getBalances } from "./route";
import { GET as getStatement } from "./statement/route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/balances`;
const PAYMENTS = `${TEST_ORIGIN}/api/construction/labour/payments`;
const LABOURS = `${TEST_ORIGIN}/api/construction/labour/labours`;
const VENDORS = `${TEST_ORIGIN}/api/construction/labour/vendors`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

type Summary = {
  previousBalance: number | null;
  earned: number | null;
  overtime: number | null;
  toPay: number | null;
  advance: number | null;
  paid: number | null;
  finalAmount: number | null;
};

type Balances = {
  from: string;
  to: string;
  financial: boolean;
  items: (Summary & { partyId: string; name: string; onProject: boolean })[];
  totals: Summary;
};

type Statement = {
  name: string;
  openingBalance: number | null;
  closingBalance: number | null;
  lines: {
    date: string;
    kind: string;
    amount: number | null;
    balance: number | null;
    projectName: string | null;
    sourceType: string;
    isReversal: boolean;
    isReversed: boolean;
    payment: { id: string; cancelled: boolean } | null;
  }[];
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function seed(company: Company) {
  const [tower, villa] = await Promise.all([
    addProject(company.workspaceId, company.userId, "Tower A"),
    addProject(company.workspaceId, company.userId, "Villa"),
  ]);
  const labour = async (name: string, projectId: string) =>
    (
      await json<{ id: string }>(
        await createLabour(
          jsonRequest(LABOURS, company.cookie, {
            name,
            joiningDate: "2026-08-01",
            wageType: "daily",
            wagePerDay: 70_000,
            overtimeWagePerHour: 10_000,
            weeklyHolidays: [0],
            currentProjectId: projectId,
            openingBalance: 100_000,
          }),
        ),
      )
    ).id;
  const raju = await labour("Raju Pawar", tower);
  const seema = await labour("Seema Kale", villa);
  const vendor = await json<{ id: string }>(
    await createVendor(
      jsonRequest(VENDORS, company.cookie, {
        name: "Suresh Gang",
        joiningDate: "2026-08-01",
        projectIds: [tower],
        shifts: [],
        openingBalance: 0,
      }),
    ),
  );
  // Attendance as the ledger sees it (the attendance commands post these).
  const earned = (
    partyType: "labour" | "vendor",
    partyId: string,
    projectId: string,
    entryDate: string,
    kind: "earned" | "overtime",
    amount: number,
  ): NewLedgerEntry => ({
    partyType,
    partyId,
    projectId,
    entryDate,
    kind,
    amount,
    sourceType:
      partyType === "labour" ? "labour_attendance" : "vendor_attendance",
    sourceId: newId(),
    reversesEntryId: null,
  });
  await prisma.$transaction((tx) =>
    prismaLedger.post(tx, company.workspaceId, company.userId, [
      earned("labour", raju, tower, "2026-08-20", "earned", 50_000),
      earned("labour", raju, tower, "2026-09-10", "earned", 70_000),
      // Earned in another Project: still Raju's balance.
      earned("labour", raju, villa, "2026-09-11", "overtime", 20_000),
      // Seema worked a day on Tower A in September.
      earned("labour", seema, tower, "2026-09-15", "earned", 35_000),
      earned("vendor", vendor.id, tower, "2026-09-10", "earned", 180_000),
    ]),
  );
  const pay = async (body: Record<string, unknown>) =>
    json<{ id: string; updatedAt: string }>(
      await recordPayment(
        jsonRequest(PAYMENTS, company.cookie, {
          partyType: "labour",
          partyId: raju,
          projectId: tower,
          mode: "cash",
          ...body,
        }),
      ),
    );
  const payment = await pay({
    paymentDate: "2026-09-12",
    kind: "payment",
    amount: 30_000,
  });
  await pay({ paymentDate: "2026-09-13", kind: "advance", amount: 10_000 });
  return { tower, villa, raju, seema, vendorId: vendor.id, payment };
}

function balances(cookie: string, query: string) {
  return getBalances(jsonRequest(`${BASE}?${query}`, cookie));
}

function rowOf(body: Balances, partyId: string) {
  const row = body.items.find((item) => item.partyId === partyId);
  if (row == null) throw new Error(`No row for ${partyId}`);
  return row;
}

async function expectMatchesSummarize(
  partyId: string,
  row: Summary,
  range: { from: string; to: string },
) {
  const entries = await prisma.constructionLabourLedgerEntry.findMany({
    where: { partyId },
  });
  const expected = summarize(
    entries.map((entry) => ({
      kind: entry.kind,
      amount: entry.amount,
      entryDate: calendarDateFromDb(entry.entryDate),
    })),
    range,
  );
  expect(row).toMatchObject({
    previousBalance: expected.previousBalance,
    earned: expected.earned,
    overtime: expected.overtime,
    toPay: expected.toPay,
    advance: expected.advance,
    paid: expected.paid,
    finalAmount: expected.finalAmount,
  });
}

async function member(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

describe("labour and vendor balances HTTP", () => {
  it("gives party-wide monthly, weekly and custom figures that match summarize", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);

    const month = await json<Balances>(
      await balances(
        company.cookie,
        `projectId=${s.tower}&partyType=labour&kind=monthly&anchor=2026-09-15`,
      ),
    );
    expect(month).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    // Raju is on Tower A; Seema is on Villa but worked here this month.
    expect(month.items.map((item) => [item.name, item.onProject])).toEqual([
      ["Raju Pawar", true],
      ["Seema Kale", false],
    ]);
    expect(rowOf(month, s.raju)).toMatchObject({
      previousBalance: 150_000,
      earned: 70_000,
      overtime: 20_000,
      toPay: 90_000,
      advance: 10_000,
      paid: 30_000,
      finalAmount: 200_000,
    });
    await expectMatchesSummarize(s.raju, rowOf(month, s.raju), month);
    await expectMatchesSummarize(s.seema, rowOf(month, s.seema), month);
    expect(month.totals.finalAmount).toBe(200_000 + 135_000);

    const week = await json<Balances>(
      await balances(
        company.cookie,
        `projectId=${s.tower}&partyType=labour&kind=weekly&anchor=2026-09-16`,
      ),
    );
    expect(week).toMatchObject({ from: "2026-09-14", to: "2026-09-20" });
    expect(rowOf(week, s.raju)).toMatchObject({
      previousBalance: 200_000,
      toPay: 0,
      finalAmount: 200_000,
    });
    await expectMatchesSummarize(s.seema, rowOf(week, s.seema), week);

    const custom = await json<Balances>(
      await balances(
        company.cookie,
        `projectId=${s.tower}&partyType=labour&kind=custom&anchor=2026-09-11&to=2026-09-12`,
      ),
    );
    expect(rowOf(custom, s.raju)).toMatchObject({
      previousBalance: 220_000,
      overtime: 20_000,
      paid: 30_000,
      finalAmount: 210_000,
    });
    // Seema has no entry on Tower A in this range and is not on it.
    expect(custom.items.map((item) => item.partyId)).toEqual([s.raju]);
    await expectMatchesSummarize(
      s.raju,
      rowOf(custom, s.raju),
      period("custom", "2026-09-11", "2026-09-12"),
    );

    const backwards = await balances(
      company.cookie,
      `projectId=${s.tower}&partyType=labour&kind=custom&anchor=2026-09-12&to=2026-09-11`,
    );
    expect(backwards.status).toBe(StatusCodes.BAD_REQUEST);

    const vendors = await json<Balances>(
      await balances(
        company.cookie,
        `projectId=${s.tower}&partyType=vendor&kind=monthly&anchor=2026-09-01`,
      ),
    );
    expect(rowOf(vendors, s.vendorId)).toMatchObject({
      previousBalance: 0,
      toPay: 180_000,
      finalAmount: 180_000,
      onProject: true,
    });
  });

  it("restores the Final Amount when a payment is cancelled, and the statement shows the running balance", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const query = `projectId=${s.tower}&partyType=labour&kind=monthly&anchor=2026-09-15`;
    const cancelled = await cancelPayment(
      jsonRequest(`${PAYMENTS}/${s.payment.id}/cancel`, company.cookie, {
        expectedUpdatedAt: s.payment.updatedAt,
      }),
      { params: Promise.resolve({ id: s.payment.id }) },
    );
    expect(cancelled.status).toBe(StatusCodes.NO_CONTENT);
    const month = await json<Balances>(await balances(company.cookie, query));
    expect(rowOf(month, s.raju)).toMatchObject({
      paid: 0,
      finalAmount: 230_000,
    });

    const response = await getStatement(
      jsonRequest(
        `${BASE}/statement?projectId=${s.tower}&partyType=labour&partyId=${s.raju}&from=2026-09-01&to=2026-09-30`,
        company.cookie,
      ),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const statement = await json<Statement>(response);
    expect(statement.name).toBe("Raju Pawar");
    expect(statement.openingBalance).toBe(150_000);
    expect(
      statement.lines.map((line) => [
        line.date,
        line.kind,
        line.amount,
        line.balance,
        line.projectName,
      ]),
    ).toEqual([
      ["2026-09-10", "earned", 70_000, 220_000, "Tower A"],
      ["2026-09-11", "overtime", 20_000, 240_000, "Villa"],
      ["2026-09-12", "payment", -30_000, 210_000, "Tower A"],
      ["2026-09-12", "payment", 30_000, 240_000, "Tower A"],
      ["2026-09-13", "advance", -10_000, 230_000, "Tower A"],
    ]);
    expect(statement.closingBalance).toBe(230_000);
    const [, , paid, reversal, advance] = statement.lines;
    expect(paid).toMatchObject({
      isReversed: true,
      isReversal: false,
      payment: { id: s.payment.id, cancelled: true },
    });
    expect(reversal).toMatchObject({ isReversal: true });
    expect(advance?.payment?.cancelled).toBe(false);

    // Seema is neither on Project B nor has entries there.
    const other = await addProject(company.workspaceId, company.userId, "B");
    const off = await getStatement(
      jsonRequest(
        `${BASE}/statement?projectId=${other}&partyType=labour&partyId=${s.seema}&from=2026-09-01&to=2026-09-30`,
        company.cookie,
      ),
    );
    expect(off.status).toBe(StatusCodes.NOT_FOUND);
    // …but she has entries on Tower A, so it shows there.
    const onTower = await getStatement(
      jsonRequest(
        `${BASE}/statement?projectId=${s.tower}&partyType=labour&partyId=${s.seema}&from=2026-08-01&to=2026-09-30`,
        company.cookie,
      ),
    );
    expect(onTower.status).toBe(StatusCodes.OK);
  });

  it("returns names but null amounts without Financial, and 403 without read or off the Project", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const viewer = await member(company, { "labour.labour": ["read"] }, [
      s.tower,
    ]);
    const body = await json<Balances>(
      await balances(
        viewer.cookie,
        `projectId=${s.tower}&partyType=labour&anchor=2026-09-15`,
      ),
    );
    expect(body.financial).toBe(false);
    expect(body.items.map((item) => item.name)).toContain("Raju Pawar");
    expect(rowOf(body, s.raju).finalAmount).toBeNull();
    expect(body.totals.finalAmount).toBeNull();
    const statement = await json<Statement>(
      await getStatement(
        jsonRequest(
          `${BASE}/statement?projectId=${s.tower}&partyType=labour&partyId=${s.raju}&from=2026-09-01&to=2026-09-30`,
          viewer.cookie,
        ),
      ),
    );
    expect(statement.lines[0]?.amount).toBeNull();
    expect(statement.closingBalance).toBeNull();

    const vendors = await balances(
      viewer.cookie,
      `projectId=${s.tower}&partyType=vendor`,
    );
    expect(vendors.status).toBe(StatusCodes.FORBIDDEN);
    const villa = await balances(
      viewer.cookie,
      `projectId=${s.villa}&partyType=labour`,
    );
    expect(villa.status).toBe(StatusCodes.FORBIDDEN);

    const other = await ownerWithCompany("Other Builders");
    const foreign = await balances(
      other.cookie,
      `projectId=${s.tower}&partyType=labour`,
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });
});
