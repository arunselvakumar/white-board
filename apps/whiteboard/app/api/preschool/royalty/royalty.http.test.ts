import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { HeadOfficeView } from "@/src/preschool/application/head-office-views";
import type {
  CentreRoyaltyStatementView,
  RoyaltyStatementView,
} from "@/src/preschool/application/royalty-views";

import { GET as headOffice } from "../dashboard/head-office/route";
import { addPayment, monthRequest } from "../dashboard/testing";
import { POST as cancelPayment } from "../fees/payments/[id]/cancel/route";
import { codeOf, freezeToday, unfreezeToday } from "../fees/testing";
import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { GET as centreStatement } from "./[centreId]/route";
import { GET as statement } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD_EMAIL = "head@royalty.example.test";
const TEACHER_EMAIL = "teacher@royalty.example.test";
const PARENT_EMAIL = "parent@royalty.example.test";

function centreRequest(centreId: string, month?: string) {
  return [
    monthRequest(`/royalty/${centreId}`, month),
    { params: Promise.resolve({ centreId }) },
  ] as const;
}

function cancelRequest(reason: string): Request {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

async function read<T>(response: Response): Promise<T> {
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as T;
}

describe("/api/preschool/royalty", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let franchised: string;
  let receipts: string[];

  beforeAll(async () => {
    freezeToday();
    preschool = await seedPreschool({ centres: 2 });
    other = await seedPreschool({ name: "Other Kids", centres: 2 });
    franchised = preschool.centreIds[1] ?? "";
    const classroom = await addClassroom(preschool, { centreId: franchised });
    const child = await addChild(preschool, {
      classroomId: classroom,
      firstName: "Aadhya",
      motherEmail: PARENT_EMAIL,
    });
    const ownClassroom = await addClassroom(preschool, { name: "Nursery Z" });
    const ownChild = await addChild(preschool, { classroomId: ownClassroom });
    await addStaff(preschool, {
      role: "centre_head",
      email: HEAD_EMAIL,
      centreId: franchised,
    });
    await addStaff(preschool, {
      role: "teacher",
      email: TEACHER_EMAIL,
      centreId: franchised,
    });

    // November at the Franchised Centre: ₹10,000 tuition and ₹2,000 uniform.
    const first = await addPayment(preschool, {
      ...child,
      centreId: franchised,
      receivedOn: "2026-11-05",
      lines: [
        { head: "Tuition", amountPaise: 600_000 },
        { head: "Uniform", amountPaise: 200_000 },
      ],
    });
    const second = await addPayment(preschool, {
      ...child,
      centreId: franchised,
      receivedOn: "2026-11-20",
      lines: [{ head: "Tuition", amountPaise: 400_000 }],
    });
    receipts = [first.receiptNumber, second.receiptNumber];
    // Not in November, and not at a Franchised Centre.
    await addPayment(preschool, {
      ...child,
      centreId: franchised,
      receivedOn: "2026-10-31",
      lines: [{ head: "Tuition", amountPaise: 999_900 }],
    });
    await addPayment(preschool, {
      ...ownChild,
      receivedOn: "2026-11-10",
      lines: [{ head: "Tuition", amountPaise: 500_000 }],
    });
  });

  afterAll(async () => {
    unfreezeToday();
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("computes the month's royalty for each Franchised Centre", async () => {
    signInAsOwner(preschool);
    const view = await read<RoyaltyStatementView>(
      await statement(monthRequest("/royalty", "2026-11")),
    );
    expect(view).toMatchObject({
      month: "2026-11",
      startsOn: "2026-11-01",
      endsOn: "2026-11-30",
    });
    expect(view.centres).toHaveLength(1);
    expect(view.centres[0]).toMatchObject({
      centreId: franchised,
      franchiseeName: "Franchisee 2",
      royaltyBps: 1000,
      royaltyPercent: 10,
      royaltyBearingPaise: 1_000_000,
      otherPaise: 200_000,
      royaltyPaise: 100_000,
    });
    expect(
      view.centres[0]?.byFeeHead.map((head) => [
        head.name,
        head.royaltyBearing,
        head.collectedPaise,
      ]),
    ).toEqual([
      ["Tuition", true, 1_000_000],
      ["Uniform", false, 200_000],
    ]);
    expect(view.totals).toEqual({
      royaltyBearingPaise: 1_000_000,
      otherPaise: 200_000,
      royaltyPaise: 100_000,
    });
  });

  it("defaults to this month", async () => {
    signInAsOwner(preschool);
    const view = await read<RoyaltyStatementView>(
      await statement(monthRequest("/royalty")),
    );
    expect(view.month).toBe("2026-11");
    expect(view.totals.royaltyPaise).toBe(100_000);
  });

  it("lists the Fee Payments behind one Centre's statement", async () => {
    signInAsOwner(preschool);
    const view = await read<CentreRoyaltyStatementView>(
      await centreStatement(...centreRequest(franchised, "2026-11")),
    );
    expect(view.royaltyPaise).toBe(100_000);
    expect(
      view.payments.map((payment) => [
        payment.receiptNumber,
        payment.receivedOn,
        payment.childName,
        payment.royaltyBearingPaise,
        payment.otherPaise,
      ]),
    ).toEqual([
      [receipts[0], "2026-11-05", "Aadhya", 600_000, 200_000],
      [receipts[1], "2026-11-20", "Aadhya", 400_000, 0],
    ]);
  });

  it("shows the royalty due on the Head Office dashboard", async () => {
    signInAsOwner(preschool);
    const view = await read<HeadOfficeView>(
      await headOffice(monthRequest("/dashboard/head-office", "2026-11")),
    );
    expect(
      view.centres.map((centre) => [centre.ownership, centre.royaltyDuePaise]),
    ).toEqual(
      expect.arrayContaining([
        ["franchised", 100_000],
        ["company_owned", 0],
      ]),
    );
    expect(view.totals.royaltyDuePaise).toBe(100_000);
  });

  it("refuses a Company-owned Centre and another Workspace's Centre", async () => {
    signInAsOwner(preschool);
    const owned = await centreStatement(...centreRequest(preschool.centreId));
    expect(owned.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(owned)).toBe("CENTRE_NOT_FRANCHISED");
    const elsewhere = await centreStatement(
      ...centreRequest(other.centreIds[1] ?? ""),
    );
    expect(elsewhere.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("is the Owner's only", async () => {
    for (const [role, email] of [
      ["teacher", HEAD_EMAIL],
      ["teacher", TEACHER_EMAIL],
      ["parent", PARENT_EMAIL],
    ] as const) {
      signInWithEmail(preschool, role, email);
      expect((await statement(monthRequest("/royalty"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      expect((await centreStatement(...centreRequest(franchised))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    }
  });

  it("leaves a cancelled Fee Payment out of the statement and its Receipts", async () => {
    signInAsOwner(preschool);
    const child = await prisma.preschoolChild.findFirstOrThrow({
      where: { workspaceId: preschool.workspaceId, firstName: "Aadhya" },
      include: { admissions: { take: 1 } },
    });
    const { paymentId, receiptNumber } = await addPayment(preschool, {
      childId: child.id,
      admissionId: child.admissions[0]?.id ?? "",
      centreId: franchised,
      receivedOn: "2026-11-24",
      lines: [{ head: "Tuition", amountPaise: 300_000 }],
    });
    const totals = async () =>
      (
        await read<RoyaltyStatementView>(
          await statement(monthRequest("/royalty", "2026-11")),
        )
      ).totals;
    expect((await totals()).royaltyBearingPaise).toBe(1_300_000);
    const response = await cancelPayment(cancelRequest("Wrong Child"), {
      params: Promise.resolve({ id: paymentId }),
    });
    expect(response.status).toBe(StatusCodes.OK);
    expect(await totals()).toEqual({
      royaltyBearingPaise: 1_000_000,
      otherPaise: 200_000,
      royaltyPaise: 100_000,
    });
    const view = await read<CentreRoyaltyStatementView>(
      await centreStatement(...centreRequest(franchised, "2026-11")),
    );
    expect(view.payments.map((payment) => payment.receiptNumber)).not.toContain(
      receiptNumber,
    );
  });
});
