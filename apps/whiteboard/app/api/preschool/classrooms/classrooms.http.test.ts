import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ClassroomDetailView,
  ClassroomListView,
  ClassroomOptionsView,
  ClassroomView,
} from "@/src/preschool/application/classroom-views";
import { fromIsoDate } from "@/src/preschool/domain/dates";

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
import { POST as archive } from "./[id]/archive/route";
import { POST as details } from "./[id]/details/route";
import { GET as getClassroom } from "./[id]/route";
import { POST as setTeachers } from "./[id]/teachers/route";
import { GET as options } from "./options/route";
import { GET, POST } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

const HEAD = "cr-head@example.test";
const OTHER_HEAD = "cr-head-b@example.test";
const TEACHER = "cr-teacher@example.test";
const PARENT = "cr-parent@example.test";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/preschool/classrooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function listRequest(query: Record<string, string>): Request {
  return new Request(
    `http://localhost/api/preschool/classrooms?${new URLSearchParams(query).toString()}`,
  );
}

async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

describe("/api/preschool/classrooms", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let nurseryA: string;
  let nurseryB: string;
  let branchClassroom: string;
  let teacherId: string;
  let headId: string;
  let helperId: string;
  let branchTeacherId: string;
  let childId: string;

  beforeAll(async () => {
    [preschool, other] = await Promise.all([
      seedPreschool({ centres: 2 }),
      seedPreschool({ name: "Other School" }),
    ]);
    nurseryA = await addClassroom(preschool, { capacity: 3 });
    nurseryB = await addClassroom(preschool, {
      name: "Nursery B",
      capacity: 10,
    });
    branchClassroom = await addClassroom(preschool, {
      centreId: preschool.centreIds[1],
      name: "Branch Nursery",
    });
    headId = await addStaff(preschool, {
      role: "centre_head",
      email: HEAD,
      name: "Head A",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: OTHER_HEAD,
      centreId: preschool.centreIds[1],
    });
    teacherId = await addStaff(preschool, {
      role: "teacher",
      email: TEACHER,
      name: "Asha",
      classroomIds: [nurseryA],
    });
    helperId = await addStaff(preschool, { role: "helper", name: "Helper" });
    branchTeacherId = await addStaff(preschool, {
      role: "teacher",
      centreId: preschool.centreIds[1],
      name: "Branch Teacher",
    });
    ({ childId } = await addChild(preschool, {
      classroomId: nurseryA,
      firstName: "Aarav",
      dateOfBirth: "2023-01-05",
      fatherPhone: "9000000001",
      motherEmail: PARENT,
    }));
    await addChild(preschool, { classroomId: nurseryA, firstName: "Diya" });
  });

  afterAll(async () => {
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  describe("GET", () => {
    it("lists a Centre's Classrooms this year with seats and Class Teachers", async () => {
      signInAsOwner(preschool);
      const response = await GET(listRequest({ centreId: preschool.centreId }));
      expect(response.status).toBe(StatusCodes.OK);
      const body = (await response.json()) as ClassroomListView;
      expect(body.academicYear).toEqual({
        id: preschool.academicYearId,
        name: "2026–27",
      });
      expect(body.items.map((classroom) => classroom.name)).toEqual([
        "Nursery A",
        "Nursery B",
      ]);
      expect(body.items[0]).toMatchObject({
        id: nurseryA,
        programmeName: "Nursery (Pre-KG)",
        capacity: 3,
        childCount: 2,
        seatsLeft: 1,
        teachers: [{ staffId: teacherId, name: "Asha" }],
      });
    });

    it("lists another Academic Year when asked", async () => {
      signInAsOwner(preschool);
      const year = await prisma.preschoolAcademicYear.create({
        data: {
          id: randomUUID(),
          workspaceId: preschool.workspaceId,
          name: "2027–28",
          startsOn: fromIsoDate("2027-04-01"),
          endsOn: fromIsoDate("2028-03-31"),
        },
      });
      const response = await GET(
        listRequest({
          centreId: preschool.centreId,
          academicYearId: year.id,
        }),
      );
      expect(await response.json()).toEqual({
        academicYear: { id: year.id, name: "2027–28" },
        items: [],
      });
      const foreign = await GET(
        listRequest({
          centreId: preschool.centreId,
          academicYearId: other.academicYearId,
        }),
      );
      expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    });

    it("shows a Teacher only their own Classrooms", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      const response = await GET(listRequest({ centreId: preschool.centreId }));
      expect(
        ((await response.json()) as ClassroomListView).items.map(
          (classroom) => classroom.id,
        ),
      ).toEqual([nurseryA]);
    });

    it("answers 403 to a Parent and CENTRE_FORBIDDEN for another Centre", async () => {
      signInWithEmail(preschool, "parent", PARENT);
      expect(
        (await GET(listRequest({ centreId: preschool.centreId }))).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      const response = await GET(listRequest({ centreId: preschool.centreId }));
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("CENTRE_FORBIDDEN");
    });
  });

  describe("GET /{id}", () => {
    it("gives the roster without fee data", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      const response = await getClassroom(
        new Request("http://localhost"),
        idContext(nurseryA),
      );
      expect(response.status).toBe(StatusCodes.OK);
      const body = (await response.json()) as ClassroomDetailView;
      expect(body.roster.map((child) => child.firstName)).toEqual([
        "Aarav",
        "Diya",
      ]);
      expect(body.roster[0]).toEqual({
        childId,
        firstName: "Aarav",
        lastName: null,
        admissionNumber: expect.any(String) as unknown,
        dateOfBirth: "2023-01-05",
        photoUrl: null,
        fatherPhone: "9000000001",
        motherPhone: null,
      });
    });

    it("answers 403 to a Teacher of another Classroom, and 404 across Workspaces", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      const response = await getClassroom(
        new Request("http://localhost"),
        idContext(nurseryB),
      );
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("CLASSROOM_FORBIDDEN");

      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      const branch = await getClassroom(
        new Request("http://localhost"),
        idContext(nurseryB),
      );
      expect(await codeOf(branch)).toBe("CENTRE_FORBIDDEN");

      signInAsOwner(other);
      expect(
        (
          await getClassroom(
            new Request("http://localhost"),
            idContext(nurseryA),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });
  });

  describe("POST", () => {
    it("lets a Centre Head add a Classroom to their Centre in the current year", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await POST(
        jsonRequest({
          centreId: preschool.centreId,
          programmeId: preschool.programmeIds["LKG"],
          name: " LKG  A ",
          capacity: 15,
        }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
      expect(await response.json()).toMatchObject({
        centreId: preschool.centreId,
        academicYearId: preschool.academicYearId,
        programmeName: "LKG",
        name: "LKG A",
        capacity: 15,
        childCount: 0,
        seatsLeft: 15,
        teachers: [],
      });
    });

    it("refuses a Teacher, another Centre, and a duplicate name", async () => {
      const body = {
        centreId: preschool.centreId,
        programmeId: preschool.programmeIds["LKG"],
        name: "LKG B",
        capacity: 15,
      };
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await POST(jsonRequest(body))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      const forbidden = await POST(jsonRequest(body));
      expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(forbidden)).toBe("CENTRE_FORBIDDEN");

      signInAsOwner(preschool);
      const duplicate = await POST(jsonRequest({ ...body, name: "nursery a" }));
      expect(duplicate.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(duplicate)).toBe("CLASSROOM_NAME_IN_USE");
      const sameNameElsewhere = await POST(
        jsonRequest({
          ...body,
          centreId: preschool.centreIds[1],
          name: "Nursery A",
        }),
      );
      expect(sameNameElsewhere.status).toBe(StatusCodes.CREATED);
    });

    it("refuses a foreign or archived Programme and no capacity", async () => {
      signInAsOwner(preschool);
      const base = {
        centreId: preschool.centreId,
        name: "Toddlers",
        capacity: 10,
      };
      const foreign = await POST(
        jsonRequest({ ...base, programmeId: other.programmeIds["LKG"] }),
      );
      expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
      const daycare = preschool.programmeIds["Daycare"] ?? "";
      await prisma.preschoolProgramme.update({
        where: { id: daycare },
        data: { archivedAt: new Date() },
      });
      const archived = await POST(
        jsonRequest({ ...base, programmeId: daycare }),
      );
      expect(archived.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(archived)).toBe("PROGRAMME_ARCHIVED");
      await prisma.preschoolProgramme.update({
        where: { id: daycare },
        data: { archivedAt: null },
      });
      expect(
        (
          await POST(
            jsonRequest({ ...base, programmeId: daycare, capacity: 0 }),
          )
        ).status,
      ).toBe(StatusCodes.BAD_REQUEST);
    });
  });

  describe("details and archive", () => {
    it("renames and resizes, but not below the Children in it", async () => {
      signInAsOwner(preschool);
      const smaller = await details(
        jsonRequest({ name: "Nursery A", capacity: 1 }),
        idContext(nurseryA),
      );
      expect(smaller.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(smaller)).toBe("CLASSROOM_CAPACITY_BELOW_CHILDREN");
      const response = await details(
        jsonRequest({ name: "Nursery Sunflower", capacity: 2 }),
        idContext(nurseryA),
      );
      expect(response.status).toBe(StatusCodes.OK);
      expect(await response.json()).toMatchObject({
        name: "Nursery Sunflower",
        capacity: 2,
        seatsLeft: 0,
      });
      const clash = await details(
        jsonRequest({ name: "Nursery Sunflower", capacity: 10 }),
        idContext(nurseryB),
      );
      expect(clash.status).toBe(StatusCodes.CONFLICT);
    });

    it("answers 403 to a Teacher and 404 across Workspaces", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect(
        (
          await details(
            jsonRequest({ name: "Mine", capacity: 5 }),
            idContext(nurseryA),
          )
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
      signInAsOwner(other);
      expect(
        (
          await details(
            jsonRequest({ name: "Mine", capacity: 5 }),
            idContext(nurseryA),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
      expect(
        (await archive(new Request("http://localhost"), idContext(nurseryA)))
          .status,
      ).toBe(StatusCodes.NOT_FOUND);
    });

    it("archives only a Classroom with no Children", async () => {
      signInAsOwner(preschool);
      const full = await archive(
        new Request("http://localhost"),
        idContext(nurseryA),
      );
      expect(full.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(full)).toBe("CLASSROOM_HAS_CHILDREN");

      const empty = await addClassroom(preschool, { name: "Spare" });
      const response = await archive(
        new Request("http://localhost"),
        idContext(empty),
      );
      expect(response.status).toBe(StatusCodes.OK);
      expect(((await response.json()) as ClassroomView).isArchived).toBe(true);
      const listed = (await (
        await GET(listRequest({ centreId: preschool.centreId }))
      ).json()) as ClassroomListView;
      expect(listed.items.map((classroom) => classroom.id)).not.toContain(
        empty,
      );
      expect(
        (
          await details(
            jsonRequest({ name: "Spare", capacity: 5 }),
            idContext(empty),
          )
        ).status,
      ).toBe(StatusCodes.CONFLICT);
    });
  });

  describe("POST /{id}/teachers", () => {
    it("sets the Class Teachers from active Teachers and Centre Heads of the Centre", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await setTeachers(
        jsonRequest({ staffIds: [teacherId, headId] }),
        idContext(nurseryB),
      );
      expect(response.status).toBe(StatusCodes.OK);
      expect(
        ((await response.json()) as ClassroomView).teachers.map(
          (teacher) => teacher.staffId,
        ),
      ).toEqual([teacherId, headId]);
      const cleared = await setTeachers(
        jsonRequest({ staffIds: [headId] }),
        idContext(nurseryB),
      );
      expect(
        ((await cleared.json()) as ClassroomView).teachers.map(
          (teacher) => teacher.staffId,
        ),
      ).toEqual([headId]);
    });

    it("refuses a helper, another Centre's Staff, inactive Staff and unknown ids", async () => {
      signInAsOwner(preschool);
      const helper = await setTeachers(
        jsonRequest({ staffIds: [helperId] }),
        idContext(nurseryB),
      );
      expect(helper.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(helper)).toBe("CLASS_TEACHER_ROLE");
      const elsewhere = await setTeachers(
        jsonRequest({ staffIds: [branchTeacherId] }),
        idContext(nurseryB),
      );
      expect(await codeOf(elsewhere)).toBe("CLASS_TEACHER_OTHER_CENTRE");
      expect(
        (
          await setTeachers(
            jsonRequest({ staffIds: [branchTeacherId] }),
            idContext(branchClassroom),
          )
        ).status,
      ).toBe(StatusCodes.OK);

      const inactive = await addStaff(preschool, { role: "teacher" });
      await prisma.preschoolStaff.update({
        where: { id: inactive },
        data: { status: "inactive" },
      });
      const inactiveResponse = await setTeachers(
        jsonRequest({ staffIds: [inactive] }),
        idContext(nurseryB),
      );
      expect(inactiveResponse.status).toBe(StatusCodes.CONFLICT);

      const foreignStaff = await addStaff(other, { role: "teacher" });
      expect(
        (
          await setTeachers(
            jsonRequest({ staffIds: [foreignStaff] }),
            idContext(nurseryB),
          )
        ).status,
      ).toBe(StatusCodes.NOT_FOUND);
    });

    it("answers CENTRE_FORBIDDEN to another Centre's Head", async () => {
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      const response = await setTeachers(
        jsonRequest({ staffIds: [] }),
        idContext(nurseryB),
      );
      expect(response.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(response)).toBe("CENTRE_FORBIDDEN");
    });
  });

  describe("GET /options", () => {
    function optionsRequest(centreId: string): Request {
      return new Request(
        `http://localhost/api/preschool/classrooms/options?centreId=${centreId}`,
      );
    }

    it("gives Programmes and this year's Classrooms with seats left", async () => {
      signInWithEmail(preschool, "teacher", HEAD);
      const response = await options(optionsRequest(preschool.centreId));
      expect(response.status).toBe(StatusCodes.OK);
      const body = (await response.json()) as ClassroomOptionsView;
      expect(body.academicYear.id).toBe(preschool.academicYearId);
      expect(body.programmes.map((programme) => programme.name)).toContain(
        "LKG",
      );
      expect(
        body.classrooms.find((classroom) => classroom.id === nurseryB),
      ).toMatchObject({ seatsLeft: 10, programmeName: "Nursery (Pre-KG)" });
    });

    it("answers 403 to a Teacher and to another Centre's Head", async () => {
      signInWithEmail(preschool, "teacher", TEACHER);
      expect((await options(optionsRequest(preschool.centreId))).status).toBe(
        StatusCodes.FORBIDDEN,
      );
      signInWithEmail(preschool, "teacher", OTHER_HEAD);
      expect(
        await codeOf(await options(optionsRequest(preschool.centreId))),
      ).toBe("CENTRE_FORBIDDEN");
    });
  });
});
