import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ChildFeeAccountView,
  InvoiceView,
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
import { POST as generate } from "./children/[childId]/generate/route";
import { GET as account } from "./children/[childId]/route";
import { POST as cancelInvoice } from "./invoices/[id]/cancel/route";
import { POST as concession } from "./invoices/[id]/concession/route";
import { POST as invoiceDetails } from "./invoices/[id]/details/route";
import { POST as createInvoice } from "./invoices/route";
import {
  addInvoice,
  childContext,
  codeOf,
  emptyRequest,
  feeHeadId,
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

const HEAD = "fa-head@example.test";
const OTHER_HEAD = "fa-head-b@example.test";
const TEACHER = "fa-teacher@example.test";
const PARENT = "fa-parent@example.test";
const OTHER_PARENT = "fa-parent-b@example.test";

async function readAccount(childId: string): Promise<ChildFeeAccountView> {
  const response = await account(getRequest(""), childContext(childId));
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as ChildFeeAccountView;
}

describe("A Child's fee account and Invoices", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let nursery: string;
  let child: { childId: string; admissionId: string };
  let sibling: { childId: string; admissionId: string };
  let lkgChild: { childId: string; admissionId: string };
  let foreignChild: { childId: string; admissionId: string };

  beforeAll(async () => {
    freezeToday();
    [preschool, other] = await Promise.all([
      seedPreschool({ centres: 2 }),
      seedPreschool({ name: "Other School" }),
    ]);
    nursery = await addClassroom(preschool);
    const lkg = await addClassroom(preschool, {
      programme: "LKG",
      name: "LKG A",
    });
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
    child = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Aarav",
      motherEmail: PARENT,
    });
    sibling = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Diya",
      motherEmail: OTHER_PARENT,
    });
    lkgChild = await addChild(preschool, { classroomId: lkg });
    foreignChild = await addChild(other, {
      classroomId: await addClassroom(other),
    });
    await setStructure(preschool, {
      programme: "Nursery (Pre-KG)",
      lines: [
        { head: "Admission fee", amountPaise: 500_000, frequency: "one_time" },
        { head: "Tuition", amountPaise: 1_200_000, frequency: "term" },
      ],
    });
  });

  afterAll(async () => {
    unfreezeToday();
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  describe("raising Invoices", () => {
    it("raises an Admission's Invoices from the Fee Structure, once", async () => {
      const invoicer = createAdmissionInvoicer();
      const input = {
        admissionId: child.admissionId,
        childId: child.childId,
        centreId: preschool.centreId,
        programmeId: preschool.programmeIds["Nursery (Pre-KG)"] ?? "",
        academicYearId: preschool.academicYearId,
        admittedOn: "2026-06-01",
      };
      await invoicer.onAdmitted(input);
      await invoicer.onAdmitted(input);
      signInAsOwner(preschool);
      const {
        invoices,
        totals,
        child: summary,
      } = await readAccount(child.childId);
      expect(
        invoices.map(({ label, dueOn, amountPaise, status }) => ({
          label,
          dueOn,
          amountPaise,
          status,
        })),
      ).toEqual([
        {
          label: "Admission fee",
          dueOn: "2026-06-01",
          amountPaise: 500_000,
          status: "overdue",
        },
        {
          label: "Tuition — Term 1",
          dueOn: "2026-06-01",
          amountPaise: 1_200_000,
          status: "overdue",
        },
        {
          label: "Tuition — Term 2",
          dueOn: "2026-08-01",
          amountPaise: 1_200_000,
          status: "overdue",
        },
        {
          label: "Tuition — Term 3",
          dueOn: "2026-12-01",
          amountPaise: 1_200_000,
          status: "upcoming",
        },
      ]);
      expect(totals).toEqual({
        billedPaise: 4_100_000,
        concessionPaise: 0,
        paidPaise: 0,
        duePaise: 4_100_000,
        overduePaise: 2_900_000,
      });
      expect(summary).toMatchObject({
        firstName: "Aarav",
        classroom: { id: nursery, name: "Nursery A" },
        programme: { name: "Nursery (Pre-KG)" },
        academicYear: { name: "2026–27" },
        fatherPhone: "9876543210",
      });
    });

    it("generates for a Child admitted before, and only once", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await generate(
        emptyRequest(),
        childContext(sibling.childId),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
      expect(
        ((await response.json()) as ChildFeeAccountView).invoices,
      ).toHaveLength(4);
      const again = await generate(
        emptyRequest(),
        childContext(sibling.childId),
      );
      expect(again.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(again)).toBe("INVOICES_EXIST");
    });

    it("says when there is no Fee Structure or no active Admission", async () => {
      signInAsOwner(preschool);
      const missing = await generate(
        emptyRequest(),
        childContext(lkgChild.childId),
      );
      expect(missing.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(missing)).toBe("FEE_STRUCTURE_MISSING");

      const leaver = await addChild(preschool, { classroomId: nursery });
      await prisma.preschoolAdmission.update({
        where: { id: leaver.admissionId },
        data: { status: "ended" },
      });
      const notAdmitted = await generate(
        emptyRequest(),
        childContext(leaver.childId),
      );
      expect(await codeOf(notAdmitted)).toBe("CHILD_NOT_ADMITTED");
    });

    it("answers 403 to a Teacher and another Centre's Head, 404 across Workspaces", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (await generate(emptyRequest(), childContext(lkgChild.childId))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(
          await generate(emptyRequest(), childContext(lkgChild.childId)),
        ),
      ).toBe("CENTRE_FORBIDDEN");
      signInAsOwner(preschool);
      expect(
        (await generate(emptyRequest(), childContext(foreignChild.childId)))
          .status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe("reading the account", () => {
    it("lets a Parent read their own Child's account only", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      expect((await readAccount(child.childId)).child.id).toBe(child.childId);
      const sibling403 = await account(
        getRequest(""),
        childContext(sibling.childId),
      );
      expect(sibling403.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(sibling403)).toBe("CHILD_FORBIDDEN");
    });

    it("refuses a Teacher and another Centre's Head; 404 across Workspaces", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (await account(getRequest(""), childContext(child.childId))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(
          await account(getRequest(""), childContext(child.childId)),
        ),
      ).toBe("CENTRE_FORBIDDEN");
      signInAsOwner(preschool);
      expect(
        (await account(getRequest(""), childContext(foreignChild.childId)))
          .status,
      ).toBe(StatusCodes.NOT_FOUND);
    });

    it("keeps an earlier Admission's unpaid Invoices on the account", async () => {
      signInAsOwner(preschool);
      const old = await addChild(preschool, { classroomId: nursery });
      await prisma.preschoolAdmission.update({
        where: { id: old.admissionId },
        data: { status: "ended" },
      });
      const next = await prisma.preschoolAdmission.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: preschool.workspaceId,
          centreId: preschool.centreId,
          childId: old.childId,
          academicYearId: preschool.academicYearId,
          programmeId: preschool.programmeIds["LKG"] ?? "",
          classroomId: (
            await prisma.preschoolClassroom.findFirstOrThrow({
              where: { workspaceId: preschool.workspaceId, name: "LKG A" },
            })
          ).id,
          admittedOn: new Date("2026-10-01T00:00:00Z"),
        },
      });
      await addInvoice(preschool, {
        childId: old.childId,
        admissionId: old.admissionId,
        label: "Old unpaid",
        dueOn: "2026-05-01",
        amountPaise: 1000,
      });
      await addInvoice(preschool, {
        childId: old.childId,
        admissionId: old.admissionId,
        label: "Old paid",
        dueOn: "2026-05-01",
        amountPaise: 1000,
        paidPaise: 1000,
      });
      await addInvoice(preschool, {
        childId: old.childId,
        admissionId: next.id,
        label: "New paid",
        dueOn: "2026-10-01",
        amountPaise: 500,
        paidPaise: 500,
      });
      const { invoices, child: summary } = await readAccount(old.childId);
      expect(invoices.map((invoice) => invoice.label)).toEqual([
        "Old unpaid",
        "New paid",
      ]);
      expect(summary.classroom?.name).toBe("LKG A");
    });
  });

  describe("changing Invoices", () => {
    let invoiceId: string;

    it("adds an Invoice to the active Admission", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await createInvoice(
        jsonRequest({
          childId: child.childId,
          feeHeadId: feeHeadId(preschool, "Activity fee"),
          label: " Annual day costume ",
          dueOn: "2026-12-15",
          amountPaise: 50_000,
        }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
      const invoice = (await response.json()) as InvoiceView;
      expect(invoice).toMatchObject({
        admissionId: child.admissionId,
        feeHeadName: "Activity fee",
        label: "Annual day costume",
        duePaise: 50_000,
        status: "upcoming",
      });
      invoiceId = invoice.id;
    });

    it("refuses an archived Fee Head, no amount, and a Teacher", async () => {
      signInAsOwner(preschool);
      const daycare = feeHeadId(preschool, "Daycare");
      await prisma.preschoolFeeHead.update({
        where: { id: daycare },
        data: { archivedAt: new Date() },
      });
      const body = {
        childId: child.childId,
        feeHeadId: daycare,
        label: "Extra hours",
        dueOn: "2026-12-01",
        amountPaise: 100,
      };
      const archived = await createInvoice(jsonRequest(body));
      expect(await codeOf(archived)).toBe("FEE_HEAD_ARCHIVED");
      expect(
        (await createInvoice(jsonRequest({ ...body, amountPaise: 0 }))).status,
      ).toBe(StatusCodes.BAD_REQUEST);
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await createInvoice(jsonRequest(body))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
    });

    it("changes details, never below what is paid plus the concession", async () => {
      signInAsOwner(preschool);
      await prisma.preschoolInvoice.update({
        where: { id: invoiceId },
        data: { paidPaise: 20_000 },
      });
      const below = await invoiceDetails(
        jsonRequest({
          label: "Costume",
          dueOn: "2026-12-20",
          amountPaise: 19_999,
        }),
        idContext(invoiceId),
      );
      expect(below.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(below)).toBe("INVOICE_AMOUNT_BELOW_PAID");
      const response = await invoiceDetails(
        jsonRequest({
          label: "Costume",
          dueOn: "2026-12-20",
          amountPaise: 40_000,
        }),
        idContext(invoiceId),
      );
      expect(await response.json()).toMatchObject({
        label: "Costume",
        dueOn: "2026-12-20",
        amountPaise: 40_000,
        duePaise: 20_000,
        status: "partly_paid",
      });
    });

    it("gives a concession with a reason, never more than is left", async () => {
      signInAsOwner(preschool);
      const noReason = await concession(
        jsonRequest({ concessionPaise: 5000 }),
        idContext(invoiceId),
      );
      expect(await codeOf(noReason)).toBe("CONCESSION_REASON_REQUIRED");
      const tooMuch = await concession(
        jsonRequest({ concessionPaise: 20_001, reason: "Sibling" }),
        idContext(invoiceId),
      );
      expect(tooMuch.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(tooMuch)).toBe("CONCESSION_EXCEEDS_DUE");
      const response = await concession(
        jsonRequest({ concessionPaise: 5000, reason: " Sibling " }),
        idContext(invoiceId),
      );
      expect(await response.json()).toMatchObject({
        concessionPaise: 5000,
        concessionReason: "Sibling",
        duePaise: 15_000,
      });
    });

    it("cancels only an Invoice nothing is paid against", async () => {
      signInAsOwner(preschool);
      const paid = await cancelInvoice(emptyRequest(), idContext(invoiceId));
      expect(paid.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(paid)).toBe("INVOICE_PAID");

      const unpaid = await addInvoice(preschool, {
        childId: child.childId,
        admissionId: child.admissionId,
        label: "Picnic",
        dueOn: "2026-12-10",
        amountPaise: 30_000,
      });
      const response = await cancelInvoice(emptyRequest(), idContext(unpaid));
      expect(response.status).toBe(StatusCodes.OK);
      expect(await response.json()).toMatchObject({
        status: "cancelled",
        duePaise: 0,
      });
      const edit = await invoiceDetails(
        jsonRequest({ label: "Picnic", dueOn: "2026-12-10", amountPaise: 1 }),
        idContext(unpaid),
      );
      expect(await codeOf(edit)).toBe("INVOICE_CANCELLED");
      const { invoices, totals } = await readAccount(child.childId);
      expect(invoices.find((invoice) => invoice.id === unpaid)?.status).toBe(
        "cancelled",
      );
      expect(totals.billedPaise).toBe(4_100_000 + 40_000);
    });

    it("answers CENTRE_FORBIDDEN to another Centre's Head and 404 across Workspaces", async () => {
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(await cancelInvoice(emptyRequest(), idContext(invoiceId))),
      ).toBe("CENTRE_FORBIDDEN");
      signInAsOwner(other);
      expect(
        (
          await concession(
            jsonRequest({ concessionPaise: 0 }),
            idContext(invoiceId),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect(
        (
          await createInvoice(
            jsonRequest({
              childId: child.childId,
              feeHeadId: feeHeadId(other, "Tuition"),
              label: "x",
              dueOn: "2026-12-01",
              amountPaise: 1,
            }),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });
});
