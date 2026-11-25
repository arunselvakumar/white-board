import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  DuesListView,
  FeePaymentListView,
  FeeSummaryView,
  ReceiptView,
} from "@/src/preschool/application/fee-views";
import { createAdmissionInvoicer } from "@/src/preschool/infrastructure/fee-admission-invoicer";

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
import { GET as dues } from "./dues/route";
import { GET as receipt } from "./payments/[id]/route";
import { GET as listPayments, POST as pay } from "./payments/route";
import { GET as summary } from "./summary/route";
import {
  addInvoice,
  codeOf,
  freezeToday,
  getRequest,
  idContext,
  jsonRequest,
  setStructure,
  unfreezeToday,
} from "./testing";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD = "fp-head@example.test";
const OTHER_HEAD = "fp-head-b@example.test";
const TEACHER = "fp-teacher@example.test";
const PARENT = "fp-parent@example.test";
const OTHER_PARENT = "fp-parent-b@example.test";

type Child = { childId: string; admissionId: string };

async function invoicesOf(childId: string) {
  return prisma.preschoolInvoice.findMany({
    where: { childId },
    orderBy: [{ dueOn: "asc" }, { label: "asc" }],
    include: { allocations: true },
  });
}

describe("Fee Payments, Receipts, Dues", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let nursery: string;
  let lkg: string;
  let aarav: Child;
  let diya: Child;
  let kabir: Child;
  let firstReceiptId: string;

  async function record(body: Record<string, unknown>) {
    const response = await pay(jsonRequest(body));
    return {
      status: response.status,
      body: (await response.json()) as ReceiptView & { code?: string },
    };
  }

  beforeAll(async () => {
    freezeToday();
    [preschool, other] = await Promise.all([
      seedPreschool({ centres: 2 }),
      seedPreschool({ name: "Other School" }),
    ]);
    nursery = await addClassroom(preschool);
    lkg = await addClassroom(preschool, { programme: "LKG", name: "LKG A" });
    await addStaff(preschool, { role: "centre_head", email: HEAD });
    await addStaff(preschool, {
      role: "centre_head",
      email: OTHER_HEAD,
      centreId: preschool.centreIds[1],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: TEACHER,
      classroomIds: [nursery],
    });
    await setStructure(preschool, {
      programme: "Nursery (Pre-KG)",
      lines: [
        { head: "Admission fee", amountPaise: 500_000, frequency: "one_time" },
        { head: "Tuition", amountPaise: 1_200_000, frequency: "term" },
      ],
    });
    aarav = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Aarav",
      motherEmail: PARENT,
    });
    diya = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Diya",
      motherEmail: OTHER_PARENT,
    });
    kabir = await addChild(preschool, { classroomId: lkg, firstName: "Kabir" });
    const invoicer = createAdmissionInvoicer();
    for (const child of [aarav, diya])
      await invoicer.onAdmitted({
        ...child,
        centreId: preschool.centreId,
        programmeId: preschool.programmeIds["Nursery (Pre-KG)"] ?? "",
        academicYearId: preschool.academicYearId,
        admittedOn: "2026-06-01",
      });
    await addInvoice(preschool, {
      ...kabir,
      label: "Kit",
      head: "Kit & books",
      dueOn: "2026-12-15",
      amountPaise: 10_000,
    });
  });

  afterAll(async () => {
    unfreezeToday();
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  describe("POST /payments", () => {
    it("allocates oldest first and returns a numbered Receipt", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const { status, body } = await record({
        childId: aarav.childId,
        amountPaise: 1_000_000,
        method: "cash",
      });
      expect(status).toBe(StatusCodes.CREATED);
      firstReceiptId = body.id;
      expect(body).toMatchObject({
        receiptNumber: "LS/2026-27/00001",
        receivedOn: "2026-11-25",
        centre: { id: preschool.centreId, name: "Little Steps" },
        child: {
          id: aarav.childId,
          firstName: "Aarav",
          classroomName: "Nursery A",
          fatherName: "Father",
          motherName: "Mother",
        },
        amountPaise: 1_000_000,
        amountInWords: "Rupees Ten Thousand Only",
        method: "cash",
        receivedByName: "fp-head",
        balanceDuePaise: 3_100_000,
      });
      expect(body.lines.map((line) => line.label).sort()).toEqual([
        "Admission fee",
        "Tuition — Term 1",
      ]);
      expect(body.lines.reduce((sum, line) => sum + line.amountPaise, 0)).toBe(
        1_000_000,
      );
    });

    it("refuses more than the Child owes and a date in the future", async () => {
      signInAsOwner(preschool);
      const over = await record({
        childId: aarav.childId,
        amountPaise: 3_100_001,
        method: "upi",
      });
      expect(over.status).toBe(StatusCodes.CONFLICT);
      expect(over.body.code).toBe("FEE_OVERPAY");
      const future = await record({
        childId: aarav.childId,
        amountPaise: 100,
        method: "cash",
        receivedOn: "2026-11-26",
      });
      expect(future.status).toBe(StatusCodes.BAD_REQUEST);
      expect(future.body.code).toBe("FEE_PAYMENT_DATE_IN_FUTURE");
    });

    it("pays only the Invoices named", async () => {
      signInAsOwner(preschool);
      const term3 = (await invoicesOf(aarav.childId)).find(
        (invoice) => invoice.label === "Tuition — Term 3",
      );
      const { status, body } = await record({
        childId: aarav.childId,
        amountPaise: 1_200_000,
        method: "upi",
        reference: " UPI-123 ",
        invoiceIds: [term3?.id],
      });
      expect(status).toBe(StatusCodes.CREATED);
      expect(body).toMatchObject({
        receiptNumber: "LS/2026-27/00002",
        reference: "UPI-123",
        lines: [{ invoiceId: term3?.id, amountPaise: 1_200_000 }],
      });

      const foreignInvoice = (await invoicesOf(diya.childId))[0]?.id;
      const foreign = await record({
        childId: aarav.childId,
        amountPaise: 1,
        method: "cash",
        invoiceIds: [foreignInvoice],
      });
      expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    });

    it("takes two payments at once without double numbers or over-allocation", async () => {
      signInAsOwner(preschool);
      const both = await Promise.all([
        record({
          childId: aarav.childId,
          amountPaise: 900_000,
          method: "cash",
        }),
        record({
          childId: aarav.childId,
          amountPaise: 900_000,
          method: "card",
        }),
      ]);
      expect(both.map((result) => result.status)).toEqual([
        StatusCodes.CREATED,
        StatusCodes.CREATED,
      ]);
      expect(
        new Set(both.map((result) => result.body.receiptNumber)).size,
      ).toBe(2);

      const last = await Promise.all([
        record({
          childId: aarav.childId,
          amountPaise: 100_000,
          method: "cash",
        }),
        record({
          childId: aarav.childId,
          amountPaise: 100_000,
          method: "cash",
        }),
      ]);
      expect(last.map((result) => result.status).sort()).toEqual([
        StatusCodes.CREATED,
        StatusCodes.CONFLICT,
      ]);

      const invoices = await invoicesOf(aarav.childId);
      for (const invoice of invoices) {
        expect(invoice.paidPaise).toBe(invoice.amountPaise);
        expect(
          invoice.allocations.reduce((sum, row) => sum + row.amountPaise, 0),
        ).toBe(invoice.paidPaise);
      }
      const numbers = await prisma.preschoolFeePayment.findMany({
        where: { childId: aarav.childId },
        select: { receiptNumber: true },
      });
      expect(numbers.map((row) => row.receiptNumber).sort()).toEqual([
        "LS/2026-27/00001",
        "LS/2026-27/00002",
        "LS/2026-27/00003",
        "LS/2026-27/00004",
        "LS/2026-27/00005",
      ]);
    });

    it("answers 403 to a Teacher and a Parent, CENTRE_FORBIDDEN to another Centre's Head, 404 across Workspaces", async () => {
      const body = { childId: diya.childId, amountPaise: 100, method: "cash" };
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await record(body)).status).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "parent", OTHER_PARENT);
      expect((await record(body)).status).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect((await record(body)).body.code).toBe("CENTRE_FORBIDDEN");
      signInAsOwner(other);
      expect((await record(body)).status).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe("GET /payments/{id}", () => {
    it("gives the balance as it stood after that payment", async () => {
      signInAsOwner(preschool);
      const response = await receipt(getRequest(""), idContext(firstReceiptId));
      expect(response.status).toBe(StatusCodes.OK);
      expect(await response.json()).toMatchObject({
        receiptNumber: "LS/2026-27/00001",
        balanceDuePaise: 3_100_000,
      });
    });

    it("lets only the Child's own Parent read it", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      expect(
        (await receipt(getRequest(""), idContext(firstReceiptId))).status,
      ).toBe(StatusCodes.OK);
      signInWithEmail(preschool, "parent", OTHER_PARENT);
      expect(
        await codeOf(await receipt(getRequest(""), idContext(firstReceiptId))),
      ).toBe("CHILD_FORBIDDEN");
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (await receipt(getRequest(""), idContext(firstReceiptId))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(await receipt(getRequest(""), idContext(firstReceiptId))),
      ).toBe("CENTRE_FORBIDDEN");
      signInAsOwner(other);
      expect(
        (await receipt(getRequest(""), idContext(firstReceiptId))).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe("GET /payments", () => {
    beforeAll(async () => {
      signInAsOwner(preschool);
      await record({
        childId: diya.childId,
        amountPaise: 200_000,
        method: "cheque",
        receivedOn: "2026-11-01",
      });
      await record({
        childId: diya.childId,
        amountPaise: 150_000,
        method: "bank_transfer",
        receivedOn: "2026-10-15",
      });
    });

    async function list(query: Record<string, string>) {
      const response = await listPayments(getRequest("/payments", query));
      expect(response.status).toBe(StatusCodes.OK);
      return (await response.json()) as FeePaymentListView;
    }

    it("lists a Centre's payments newest first with the range's count and sum", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const all = await list({ centreId: preschool.centreId });
      expect(all.total).toBe(7);
      expect(all.totalPaise).toBe(4_100_000 + 350_000);
      expect(all.items.at(-1)).toMatchObject({
        receivedOn: "2026-10-15",
        childName: "Diya",
        method: "bank_transfer",
      });
      const november = await list({
        centreId: preschool.centreId,
        from: "2026-11-01",
        to: "2026-11-24",
      });
      expect(november).toMatchObject({ total: 1, totalPaise: 200_000 });
    });

    it("pages with a cursor", async () => {
      signInAsOwner(preschool);
      const first = await list({ centreId: preschool.centreId, limit: "4" });
      expect(first.items).toHaveLength(4);
      expect(first.nextCursor).toBe(first.items.at(-1)?.id);
      const second = await list({
        centreId: preschool.centreId,
        limit: "4",
        cursor: first.nextCursor ?? "",
      });
      expect(second.items).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
      ).toBe(7);
    });

    it("answers 403 to a Teacher and CENTRE_FORBIDDEN to another Centre's Head", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (
          await listPayments(
            getRequest("/payments", { centreId: preschool.centreId }),
          )
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(
          await listPayments(
            getRequest("/payments", { centreId: preschool.centreId }),
          ),
        ),
      ).toBe("CENTRE_FORBIDDEN");
    });
  });

  describe("dues and summary", () => {
    async function readDues(query: Record<string, string>) {
      const response = await dues(getRequest("/dues", query));
      expect(response.status).toBe(StatusCodes.OK);
      return (await response.json()) as DuesListView;
    }

    it("lists Children who owe, most overdue first", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const { items } = await readDues({ centreId: preschool.centreId });
      expect(items).toEqual([
        {
          childId: diya.childId,
          firstName: "Diya",
          lastName: null,
          admissionNumber: expect.any(String) as unknown,
          classroom: { id: nursery, name: "Nursery A" },
          fatherName: "Father",
          fatherPhone: "9876543210",
          motherName: "Mother",
          motherPhone: null,
          duePaise: 4_100_000 - 350_000,
          overduePaise: 2_900_000 - 350_000,
          oldestDueOn: "2026-06-01",
          invoiceCount: 4,
        },
        expect.objectContaining({
          childId: kabir.childId,
          duePaise: 10_000,
          overduePaise: 0,
          classroom: { id: lkg, name: "LKG A" },
        }),
      ]);
    });

    it("filters to overdue, or to one Classroom", async () => {
      signInAsOwner(preschool);
      expect(
        (
          await readDues({ centreId: preschool.centreId, only: "overdue" })
        ).items.map((row) => row.childId),
      ).toEqual([diya.childId]);
      expect(
        (
          await readDues({ centreId: preschool.centreId, classroomId: lkg })
        ).items.map((row) => row.childId),
      ).toEqual([kabir.childId]);
    });

    it("sums collections and dues for the dashboard", async () => {
      signInAsOwner(preschool);
      const expected: FeeSummaryView = {
        collectedTodayPaise: 4_100_000,
        collectedThisMonthPaise: 4_100_000 + 200_000,
        duePaise: 3_750_000 + 10_000,
        overduePaise: 2_550_000,
        childrenWithDues: 2,
      };
      const forCentre = await summary(
        getRequest("/summary", { centreId: preschool.centreId }),
      );
      expect(await forCentre.json()).toEqual(expected);
      const everyCentre = await summary(getRequest("/summary"));
      expect(await everyCentre.json()).toEqual(expected);
    });

    it("answers 403 to a Teacher, a Parent and another Centre's Head", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (await dues(getRequest("/dues", { centreId: preschool.centreId })))
          .status,
      ).toBe(StatusCodes.FORBIDDEN);
      expect((await summary(getRequest("/summary"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "parent", PARENT);
      expect((await summary(getRequest("/summary"))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(
          await summary(
            getRequest("/summary", { centreId: preschool.centreId }),
          ),
        ),
      ).toBe("CENTRE_FORBIDDEN");
      expect(
        await codeOf(
          await dues(getRequest("/dues", { centreId: preschool.centreId })),
        ),
      ).toBe("CENTRE_FORBIDDEN");
    });
  });
});
