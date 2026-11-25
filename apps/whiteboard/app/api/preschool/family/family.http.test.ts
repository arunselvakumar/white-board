import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { FamilyHomeView } from "@/src/preschool/application/family-views";
import { fromIsoDate } from "@/src/preschool/domain/dates";

import { GET as attendanceMonth } from "../attendance/children/[childId]/route";
import { GET as childProfile } from "../children/[id]/route";
import { GET as childReports } from "../daily-reports/children/[childId]/route";
import { addPayment } from "../dashboard/testing";
import { GET as feeAccount } from "../fees/children/[childId]/route";
import { GET as receipt } from "../fees/payments/[id]/route";
import { addInvoice, freezeToday, unfreezeToday } from "../fees/testing";
import {
  addChild,
  addClassroom,
  addStaff,
  removePreschool,
  seedPreschool,
  signInWithEmail,
  signOut,
  type PreschoolFixture,
} from "../_lib/testing";
import { GET as home } from "./home/route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const PARENT = "parent@family.example.test";
const OTHER_PARENT = "other@family.example.test";
const TEACHER = "teacher@family.example.test";

type Child = { childId: string; admissionId: string };

describe("the Parent's view of a Preschool", () => {
  let preschool: PreschoolFixture;
  let aarav: Child;
  let diya: Child;
  let other: Child;
  let aaravPayment: string;
  let otherPayment: string;

  beforeAll(async () => {
    freezeToday();
    preschool = await seedPreschool({ centres: 2 });
    const { workspaceId } = preschool;
    const nursery = await addClassroom(preschool);
    const branch = await addClassroom(preschool, {
      centreId: preschool.centreIds[1],
      programme: "LKG",
      name: "LKG B",
    });
    await addStaff(preschool, {
      role: "teacher",
      email: TEACHER,
      name: "Meena R",
      classroomIds: [nursery],
    });
    aarav = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Aarav",
      motherEmail: PARENT,
    });
    diya = await addChild(preschool, {
      classroomId: branch,
      firstName: "Diya",
      fatherEmail: PARENT,
    });
    other = await addChild(preschool, {
      classroomId: nursery,
      firstName: "Kabir",
      motherEmail: OTHER_PARENT,
    });

    const pickupId = randomUUID();
    await prisma.preschoolAuthorisedPickup.create({
      data: {
        id: pickupId,
        workspaceId,
        childId: aarav.childId,
        name: "Lakshmi",
        relationship: "Grandmother",
        phone: "9840011111",
      },
    });
    const today = fromIsoDate("2026-11-25");
    await prisma.preschoolAttendance.createMany({
      data: [
        {
          id: randomUUID(),
          workspaceId,
          centreId: preschool.centreId,
          classroomId: nursery,
          childId: aarav.childId,
          date: today,
          status: "present",
          checkInAt: new Date("2026-11-25T03:35:00Z"),
          checkOutAt: new Date("2026-11-25T07:05:00Z"),
          collectedByKind: "authorised_pickup",
          collectedByName: "Lakshmi",
          collectedByPickupId: pickupId,
          markedByUserId: preschool.ownerUserId,
        },
        {
          id: randomUUID(),
          workspaceId,
          centreId: preschool.centreIds[1] ?? "",
          classroomId: branch,
          childId: diya.childId,
          date: today,
          status: "absent",
          markedByUserId: preschool.ownerUserId,
        },
      ],
    });
    const report = (
      date: string,
      status: "draft" | "published",
      note: string,
    ) => ({
      id: randomUUID(),
      workspaceId,
      centreId: preschool.centreId,
      classroomId: nursery,
      childId: aarav.childId,
      date: fromIsoDate(date),
      status,
      publishedAt:
        status === "published" ? new Date(`${date}T10:00:00Z`) : null,
      meals: [{ meal: "lunch", menu: "Curd rice", ate: "some" }],
      mood: "happy" as const,
      activities: ["Story time"],
      note,
      createdByUserId: preschool.ownerUserId,
    });
    await prisma.preschoolDailyReport.createMany({
      data: [
        report("2026-11-24", "published", "A lovely day"),
        report("2026-11-25", "draft", "Still writing"),
      ],
    });
    await addInvoice(preschool, {
      ...aarav,
      label: "November tuition",
      dueOn: "2026-11-10",
      amountPaise: 500_000,
    });
    await addInvoice(preschool, {
      ...aarav,
      label: "December tuition",
      dueOn: "2026-12-01",
      amountPaise: 300_000,
    });
    aaravPayment = (
      await addPayment(preschool, {
        ...aarav,
        receivedOn: "2026-11-02",
        lines: [{ head: "Uniform", amountPaise: 120_000 }],
      })
    ).paymentId;
    otherPayment = (
      await addPayment(preschool, {
        ...other,
        receivedOn: "2026-11-03",
        lines: [{ head: "Tuition", amountPaise: 90_000 }],
      })
    ).paymentId;
  });

  afterAll(async () => {
    unfreezeToday();
    await removePreschool(preschool);
  });

  describe("GET /api/preschool/family/home", () => {
    it("answers 401 without a Session", async () => {
      signOut();
      expect((await home()).status).toBe(StatusCodes.UNAUTHORIZED);
    });

    it("shows each of the Parent's Children and no one else's", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      const response = await home();
      expect(response.status).toBe(StatusCodes.OK);
      const view = (await response.json()) as FamilyHomeView;
      expect(view.date).toBe("2026-11-25");
      expect(view.children.map((entry) => entry.child.firstName)).toEqual([
        "Aarav",
        "Diya",
      ]);

      const [first, second] = view.children;
      expect(first?.child).toMatchObject({
        id: aarav.childId,
        classroomName: "Nursery A",
        programmeName: "Nursery (Pre-KG)",
        ageText: "3 y 8 m",
      });
      expect(first?.classTeachers).toEqual(["Meena R"]);
      expect(first?.today).toEqual({
        status: "present",
        checkInTime: "09:05",
        checkOutTime: "12:35",
        collectedBy: { name: "Lakshmi", relationship: "Grandmother" },
      });
      expect(first?.latestDailyReport).toMatchObject({
        date: "2026-11-24",
        note: "A lovely day",
        mood: "happy",
        meals: [{ meal: "lunch", menu: "Curd rice", ate: "some" }],
      });
      expect(first?.fees).toEqual({
        duePaise: 800_000,
        overduePaise: 500_000,
        nextDue: {
          dueOn: "2026-12-01",
          label: "December tuition",
          duePaise: 300_000,
        },
      });

      expect(second?.today).toEqual({
        status: "absent",
        checkInTime: null,
        checkOutTime: null,
        collectedBy: null,
      });
      expect(second?.latestDailyReport).toBeNull();
      expect(second?.fees).toEqual({
        duePaise: 0,
        overduePaise: 0,
        nextDue: null,
      });
    });

    it("never shows a draft Daily Report", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      const view = (await (await home()).json()) as FamilyHomeView;
      expect(
        view.children.map((entry) => entry.latestDailyReport?.note ?? null),
      ).not.toContain("Still writing");
    });

    it("gives another family only their own Child", async () => {
      signInWithEmail(preschool, "parent", OTHER_PARENT);
      const view = (await (await home()).json()) as FamilyHomeView;
      expect(view.children.map((entry) => entry.child.id)).toEqual([
        other.childId,
      ]);
    });

    it("answers 403 to staff", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await home()).status).toBe(StatusCodes.FORBIDDEN);
    });
  });

  describe("what else a Parent may open", () => {
    const childContext = (childId: string) => ({
      params: Promise.resolve({ childId }),
    });
    const idContext = (id: string) => ({ params: Promise.resolve({ id }) });
    const get = (path: string) => new Request(`http://localhost${path}`);

    it("opens everything about their own Child", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      const responses = {
        attendance: await attendanceMonth(
          get(
            `/api/preschool/attendance/children/${aarav.childId}?month=2026-11`,
          ),
          childContext(aarav.childId),
        ),
        reports: await childReports(
          get(`/api/preschool/daily-reports/children/${aarav.childId}`),
          childContext(aarav.childId),
        ),
        fees: await feeAccount(get("/"), childContext(aarav.childId)),
        receipt: await receipt(get("/"), idContext(aaravPayment)),
        profile: await childProfile(get("/"), idContext(aarav.childId)),
      };
      for (const [name, response] of Object.entries(responses))
        expect(response.status, name).toBe(StatusCodes.OK);
      const reports = (await responses.reports.json()) as {
        items: { status: string; note: string | null }[];
      };
      expect(reports.items.map((item) => item.status)).toEqual(["published"]);
      const profile = (await responses.profile.json()) as {
        authorisedPickups: { name: string }[];
      };
      expect(profile.authorisedPickups.map((pickup) => pickup.name)).toEqual([
        "Lakshmi",
      ]);
    });

    it("opens nothing about another family's Child", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      const responses = {
        attendance: await attendanceMonth(
          get(
            `/api/preschool/attendance/children/${other.childId}?month=2026-11`,
          ),
          childContext(other.childId),
        ),
        reports: await childReports(
          get(`/api/preschool/daily-reports/children/${other.childId}`),
          childContext(other.childId),
        ),
        fees: await feeAccount(get("/"), childContext(other.childId)),
        receipt: await receipt(get("/"), idContext(otherPayment)),
        profile: await childProfile(get("/"), idContext(other.childId)),
      };
      for (const [name, response] of Object.entries(responses))
        expect(response.status, name).toBe(StatusCodes.FORBIDDEN);
    });
  });
});
