import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CentreDashboardView } from "@/src/preschool/application/dashboard-views";
import type { HeadOfficeView } from "@/src/preschool/application/head-office-views";
import { fromIsoDate } from "@/src/preschool/domain/dates";

import {
  addInvoice,
  codeOf,
  freezeToday,
  setStructure,
  unfreezeToday,
} from "../fees/testing";
import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  signOut,
  type PreschoolFixture,
} from "../_lib/testing";
import { GET as headOffice } from "./head-office/route";
import { GET as dashboard } from "./route";
import { addPayment, monthRequest } from "./testing";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD_EMAIL = "head@dashboard.example.test";
const TEACHER_EMAIL = "teacher@dashboard.example.test";
const PARENT_EMAIL = "parent@dashboard.example.test";

function centreRequest(centreId: string): Request {
  return new Request(
    `http://localhost/api/preschool/dashboard?centreId=${centreId}`,
  );
}

async function read<T>(response: Response): Promise<T> {
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as T;
}

describe("/api/preschool/dashboard", () => {
  let preschool: PreschoolFixture;
  let fresh: PreschoolFixture;
  let centreA: string;
  let centreB: string;
  let nurseryA: string;
  let lkgA: string;
  let child1: { childId: string; admissionId: string };
  let child2: { childId: string; admissionId: string };
  let child3: { childId: string; admissionId: string };
  let followUpId: string;
  const lowItem = randomUUID();

  beforeAll(async () => {
    freezeToday();
    preschool = await seedPreschool({ centres: 2 });
    fresh = await seedPreschool({ name: "Fresh Start" });
    centreA = preschool.centreId;
    centreB = preschool.centreIds[1] ?? "";
    const { workspaceId } = preschool;
    nurseryA = await addClassroom(preschool, { capacity: 20 });
    lkgA = await addClassroom(preschool, {
      programme: "LKG",
      name: "LKG A",
      capacity: 10,
    });
    await addStaff(preschool, { role: "teacher", email: TEACHER_EMAIL });
    await addStaff(preschool, {
      role: "centre_head",
      email: HEAD_EMAIL,
      centreId: centreB,
    });
    child1 = await addChild(preschool, {
      classroomId: nurseryA,
      firstName: "Aadhya",
      motherEmail: PARENT_EMAIL,
    });
    child2 = await addChild(preschool, {
      classroomId: nurseryA,
      firstName: "Ishaan",
    });
    child3 = await addChild(preschool, {
      classroomId: lkgA,
      firstName: "Meera",
    });
    await setStructure(preschool, {
      programme: "Nursery (Pre-KG)",
      lines: [{ head: "Tuition", amountPaise: 500_000, frequency: "monthly" }],
    });

    const today = fromIsoDate("2026-11-25");
    const mark = (
      child: { childId: string },
      classroomId: string,
      checkedOut: boolean,
    ) =>
      prisma.preschoolAttendance.create({
        data: {
          id: randomUUID(),
          workspaceId,
          centreId: centreA,
          classroomId,
          childId: child.childId,
          date: today,
          status: "present",
          checkInAt: new Date("2026-11-25T03:30:00Z"),
          checkOutAt: checkedOut ? new Date("2026-11-25T07:00:00Z") : null,
          markedByUserId: preschool.ownerUserId,
        },
      });
    await mark(child1, nurseryA, true);
    await mark(child2, nurseryA, false);
    await prisma.preschoolDailyReport.create({
      data: {
        id: randomUUID(),
        workspaceId,
        centreId: centreA,
        classroomId: nurseryA,
        childId: child1.childId,
        date: today,
        status: "published",
        publishedAt: new Date("2026-11-25T10:00:00Z"),
        createdByUserId: preschool.ownerUserId,
      },
    });

    // ₹5,000 overdue for Aadhya; ₹3,000 not yet due for Ishaan; a cancelled one ignored.
    await addInvoice(preschool, {
      ...child1,
      dueOn: "2026-11-10",
      amountPaise: 500_000,
    });
    await addInvoice(preschool, {
      ...child2,
      dueOn: "2026-12-10",
      amountPaise: 300_000,
    });
    const cancelled = await addInvoice(preschool, {
      ...child3,
      dueOn: "2026-11-01",
      amountPaise: 900_000,
    });
    await prisma.preschoolInvoice.update({
      where: { id: cancelled },
      data: { cancelledAt: new Date() },
    });
    await addPayment(preschool, {
      ...child2,
      receivedOn: "2026-11-25",
      lines: [{ head: "Tuition", amountPaise: 100_000 }],
    });
    await addPayment(preschool, {
      ...child1,
      receivedOn: "2026-11-02",
      lines: [{ head: "Uniform", amountPaise: 200_000 }],
    });
    await addPayment(preschool, {
      ...child1,
      receivedOn: "2026-10-30",
      lines: [{ head: "Tuition", amountPaise: 700_000 }],
    });

    const enquiry = (input: {
      status: "new" | "admitted" | "lost";
      createdAt: string;
      nextFollowUpOn?: string;
      convertedAt?: string;
      centreId?: string;
    }) => {
      const id = randomUUID();
      return prisma.preschoolEnquiry
        .create({
          data: {
            id,
            workspaceId,
            centreId: input.centreId ?? centreA,
            createdByUserId: preschool.ownerUserId,
            childName: `Enquiry ${input.status}`,
            parentName: "Kavitha",
            parentPhone: "9840099999",
            status: input.status,
            createdAt: new Date(input.createdAt),
            nextFollowUpOn:
              input.nextFollowUpOn == null
                ? null
                : fromIsoDate(input.nextFollowUpOn),
            convertedAt:
              input.convertedAt == null ? null : new Date(input.convertedAt),
          },
        })
        .then(() => id);
    };
    followUpId = await enquiry({
      status: "new",
      createdAt: "2026-11-20T05:00:00Z",
      nextFollowUpOn: "2026-11-24",
    });
    await enquiry({
      status: "admitted",
      createdAt: "2026-10-20T05:00:00Z",
      convertedAt: "2026-11-15T05:00:00Z",
    });
    await enquiry({ status: "lost", createdAt: "2026-11-03T05:00:00Z" });
    await enquiry({
      status: "new",
      createdAt: "2026-11-03T05:00:00Z",
      centreId: centreB,
    });

    const okItem = randomUUID();
    await prisma.preschoolStockItem.createMany({
      data: [
        {
          id: lowItem,
          workspaceId,
          name: "Crayon box",
          category: "stationery",
          unit: "box",
          reorderLevel: 10,
        },
        {
          id: okItem,
          workspaceId,
          name: "Notebook",
          category: "notebooks",
          unit: "piece",
          reorderLevel: 5,
        },
      ],
    });
    const move = (itemId: string, centreId: string, quantityDelta: number) => ({
      id: randomUUID(),
      workspaceId,
      centreId,
      itemId,
      kind: "received" as const,
      quantityDelta,
      movedOn: today,
      recordedByUserId: preschool.ownerUserId,
      recordedByName: "Owner",
    });
    await prisma.preschoolStockMovement.createMany({
      data: [
        move(lowItem, centreA, 6),
        move(okItem, centreA, 20),
        move(lowItem, centreB, 50),
      ],
    });

    const announce = (input: {
      title: string;
      kind: "notice" | "event" | "holiday";
      startsOn: string;
      centreId: string | null;
    }) => ({
      id: randomUUID(),
      workspaceId,
      centreId: input.centreId,
      kind: input.kind,
      title: input.title,
      body: "Details",
      startsOn: fromIsoDate(input.startsOn),
      createdByUserId: preschool.ownerUserId,
      createdByName: "Owner",
    });
    await prisma.preschoolAnnouncement.createMany({
      data: [
        announce({
          title: "Christmas",
          kind: "holiday",
          startsOn: "2026-12-25",
          centreId: null,
        }),
        announce({
          title: "Sports day",
          kind: "event",
          startsOn: "2026-11-28",
          centreId: centreA,
        }),
        announce({
          title: "B's picnic",
          kind: "event",
          startsOn: "2026-11-27",
          centreId: centreB,
        }),
        announce({
          title: "Fee notice",
          kind: "notice",
          startsOn: "2026-11-26",
          centreId: null,
        }),
        announce({
          title: "Diwali",
          kind: "holiday",
          startsOn: "2026-11-08",
          centreId: null,
        }),
      ],
    });
  });

  afterAll(async () => {
    unfreezeToday();
    await removePreschool(preschool);
    await removePreschool(fresh);
  });

  it("answers 401 without a Session", async () => {
    signOut();
    expect((await dashboard(centreRequest(centreA))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("gives the Owner today's Centre Dashboard", async () => {
    signInAsOwner(preschool);
    const view = await read<CentreDashboardView>(
      await dashboard(centreRequest(centreA)),
    );
    expect(view.date).toBe("2026-11-25");
    expect(view.setup).toEqual({
      hasClassrooms: true,
      hasStaff: true,
      hasFeeStructure: true,
      hasChildren: true,
    });
    expect(view.children).toMatchObject({
      active: 3,
      capacity: 30,
      seatsLeft: 27,
    });
    expect(
      view.children.classrooms.map((room) => [
        room.name,
        room.childCount,
        room.present,
        room.marked,
      ]),
    ).toEqual([
      ["Nursery A", 2, 2, 2],
      ["LKG A", 1, 0, 0],
    ]);
    expect(view.attendanceToday).toEqual({
      present: 2,
      absent: 0,
      leave: 0,
      notMarked: 1,
      checkedOut: 1,
      stillHere: 1,
    });
    expect(view.dailyReportsToday).toEqual({
      published: 1,
      draft: 0,
      notStarted: 1,
    });
    expect(view.fees).toEqual({
      collectedTodayPaise: 100_000,
      collectedThisMonthPaise: 300_000,
      duePaise: 800_000,
      overduePaise: 500_000,
      childrenWithDues: 2,
    });
    expect(view.topDues).toEqual([
      {
        childId: child1.childId,
        name: "Aadhya",
        classroomName: "Nursery A",
        overduePaise: 500_000,
      },
    ]);
    expect(view.enquiries).toMatchObject({
      open: 1,
      newThisMonth: 2,
      admittedThisMonth: 1,
    });
    expect(view.enquiries.followUpsDue).toEqual([
      {
        id: followUpId,
        childName: "Enquiry new",
        parentName: "Kavitha",
        parentPhone: "9840099999",
        nextFollowUpOn: "2026-11-24",
      },
    ]);
    expect(view.lowStock).toEqual([
      {
        itemId: lowItem,
        name: "Crayon box",
        unit: "box",
        onHand: 6,
        reorderLevel: 10,
      },
    ]);
    expect(view.upcoming.map((item) => item.title)).toEqual([
      "Sports day",
      "Christmas",
    ]);
  });

  it("tells a new Centre what to set up", async () => {
    signInAsOwner(fresh);
    const view = await read<CentreDashboardView>(
      await dashboard(centreRequest(fresh.centreId)),
    );
    expect(view.setup).toEqual({
      hasClassrooms: false,
      hasStaff: false,
      hasFeeStructure: false,
      hasChildren: false,
    });
    expect(view.children).toEqual({
      active: 0,
      capacity: 0,
      seatsLeft: 0,
      classrooms: [],
    });
  });

  it("lets a Centre Head read their own Centre only", async () => {
    signInWithEmail(preschool, "teacher", HEAD_EMAIL);
    const own = await read<CentreDashboardView>(
      await dashboard(centreRequest(centreB)),
    );
    expect(own.enquiries.open).toBe(1);
    // Never stocked at this Centre but given a reorder level: 0 on hand.
    expect(own.lowStock.map((item) => [item.name, item.onHand])).toEqual([
      ["Notebook", 0],
    ]);
    expect(own.upcoming.map((item) => item.title)).toEqual([
      "B's picnic",
      "Christmas",
    ]);
    const other = await dashboard(centreRequest(centreA));
    expect(other.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(other)).toBe("CENTRE_FORBIDDEN");
  });

  it("answers 403 to a Teacher and a Parent, and to another Workspace's Centre", async () => {
    signInWithEmail(preschool, "teacher", TEACHER_EMAIL);
    expect((await dashboard(centreRequest(centreA))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    signInWithEmail(preschool, "parent", PARENT_EMAIL);
    expect((await dashboard(centreRequest(centreA))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    signInAsOwner(fresh);
    expect((await dashboard(centreRequest(centreA))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("answers 400 without a Centre", async () => {
    signInAsOwner(preschool);
    expect(
      (await dashboard(new Request("http://localhost/api/preschool/dashboard")))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  describe("head-office", () => {
    it("puts every Centre side by side for the month", async () => {
      signInAsOwner(preschool);
      const view = await read<HeadOfficeView>(
        await headOffice(monthRequest("/dashboard/head-office")),
      );
      expect(view.month).toBe("2026-11");
      const a = view.centres.find((centre) => centre.id === centreA);
      const b = view.centres.find((centre) => centre.id === centreB);
      expect(a).toMatchObject({
        ownership: "company_owned",
        activeChildren: 3,
        capacity: 30,
        occupancyPercent: 10,
        presentToday: 2,
        collectedPaise: 300_000,
        duePaise: 800_000,
        overduePaise: 500_000,
        openEnquiries: 1,
        admissions: 0,
        royaltyDuePaise: 0,
      });
      expect(b).toMatchObject({
        ownership: "franchised",
        royaltyBps: 1000,
        activeChildren: 0,
        openEnquiries: 1,
        royaltyDuePaise: 0,
      });
      expect(view.totals).toMatchObject({
        activeChildren: 3,
        collectedPaise: 300_000,
        openEnquiries: 2,
      });
    });

    it("reads another month's collections", async () => {
      signInAsOwner(preschool);
      const view = await read<HeadOfficeView>(
        await headOffice(monthRequest("/dashboard/head-office", "2026-10")),
      );
      expect(
        view.centres.find((centre) => centre.id === centreA)?.collectedPaise,
      ).toBe(700_000);
    });

    it("is the Owner's only", async () => {
      signInWithEmail(preschool, "teacher", HEAD_EMAIL);
      expect(
        (await headOffice(monthRequest("/dashboard/head-office"))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", TEACHER_EMAIL);
      expect(
        (await headOffice(monthRequest("/dashboard/head-office"))).status,
      ).toBe(StatusCodes.FORBIDDEN);
    });

    it("answers 400 for a month that is not YYYY-MM", async () => {
      signInAsOwner(preschool);
      expect(
        (await headOffice(monthRequest("/dashboard/head-office", "2026-13")))
          .status,
      ).toBe(StatusCodes.BAD_REQUEST);
    });
  });
});
