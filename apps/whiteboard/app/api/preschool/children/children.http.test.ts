import { randomUUID } from "node:crypto";

import { clearOutbox, emailsTo, seedWorkspaceMember } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { PreschoolActor } from "@/src/preschool/application/access";
import type { AdmitChildInput } from "@/src/preschool/application/child-handlers";
import type { AdmittedChild } from "@/src/preschool/application/child-ports";
import type {
  AdmitChildView,
  ChildFormOptionsView,
  ChildPageView,
  ChildProfileView,
} from "@/src/preschool/application/child-views";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { createChildHandlers } from "@/src/preschool/infrastructure/create-child-handlers";
import type {
  PreschoolAdmitChildResult,
  PreschoolChildFormOptions,
  PreschoolChildPage,
  PreschoolChildProfile,
} from "@/src/queries/preschool/children";

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
import { POST as updateHealth } from "./[id]/health/route";
import { POST as moveClassroom } from "./[id]/move-classroom/route";
import { POST as updateParents } from "./[id]/parents/route";
import { POST as replacePickups } from "./[id]/pickups/route";
import { POST as updateProfile } from "./[id]/profile/route";
import { POST as promote } from "./[id]/promote/route";
import { GET as getChild } from "./[id]/route";
import { POST as withdraw } from "./[id]/withdraw/route";
import {
  AdmitPreschoolChildResponseModel,
  ListPreschoolChildrenResponseModel,
  PreschoolChildOptionsResponseModel,
  PreschoolChildProfileModel,
} from "./child-models";
import { GET as getOptions } from "./options/route";
import { POST as admitChild, GET as listChildren } from "./route";
import { addClassroomIn, addEnquiry, addNextAcademicYear } from "./testing";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

// The client module's types are the server's views.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contract: [
  Same<ChildProfileView, PreschoolChildProfile>,
  Same<ChildPageView, PreschoolChildPage>,
  Same<AdmitChildView, PreschoolAdmitChildResult>,
  Same<ChildFormOptionsView, PreschoolChildFormOptions>,
] = [true, true, true, true];

type Json = Record<string, unknown> & { code?: string; details?: unknown };
type Result<T> = { status: number; body: T };
type Context = { params: Promise<{ id: string }> };
type Handler = (request: Request, context: Context) => Promise<Response>;

async function call<T = Json>(
  handler: Handler,
  input: { id?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<Result<T>> {
  const url = new URL("http://localhost/api/preschool/children");
  for (const [key, value] of Object.entries(input.query ?? {}))
    url.searchParams.set(key, value);
  const response = await handler(
    new Request(url, {
      method: input.body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    }),
    { params: Promise.resolve({ id: input.id ?? "" }) },
  );
  return { status: response.status, body: (await response.json()) as T };
}

const TODAY = todayInIndia(new Date());

describe("/api/preschool/children", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;
  let centreCode: string;
  let nurseryA: string;
  let nurseryB: string;
  let nurseryFull: string;
  let lkgNextYear: string;
  let branchNursery: string;
  let otherChildId: string;
  let otherClassroomId: string;
  let seededChildId: string;
  let seq = 0;

  const nursery = () => preschool.programmeIds["Nursery (Pre-KG)"] ?? "";

  /** A unique father phone per admission, so siblings only match on purpose. */
  function nextPhone(): string {
    seq += 1;
    return `97${String(seq).padStart(8, "0")}`;
  }

  function form(
    overrides: {
      child?: Record<string, unknown>;
      father?: Record<string, unknown> | null;
      mother?: Record<string, unknown> | null;
      admission?: Record<string, unknown>;
      rest?: Record<string, unknown>;
    } = {},
  ) {
    return {
      centreId: preschool.centreId,
      child: {
        firstName: "Aarav",
        lastName: "Kumar",
        dateOfBirth: "2023-03-10",
        gender: "boy",
        bloodGroup: "O+",
        motherTongue: "Tamil",
        address: {
          line: "12 Gandhi Street",
          city: "Chennai",
          pincode: "600001",
        },
        ...overrides.child,
      },
      father:
        overrides.father === undefined
          ? {
              name: "Ravi",
              phone: `+91 ${nextPhone()}`,
              occupation: "Engineer",
            }
          : overrides.father,
      mother:
        overrides.mother === undefined ? { name: "Meera" } : overrides.mother,
      emergencyContact: { name: "Grandma", phone: "9000011111" },
      authorisedPickups: [
        { name: "Grandpa", relationship: "Grandfather", phone: "09000022222" },
      ],
      health: { allergies: "Peanuts", immunisationUpToDate: true },
      documents: { hasBirthCertificate: true, hasPhotos: true },
      admission: {
        programmeId: nursery(),
        classroomId: nurseryA,
        ...overrides.admission,
      },
      ...overrides.rest,
    };
  }

  async function admit(
    overrides: Parameters<typeof form>[0] = {},
  ): Promise<AdmitChildView> {
    signInAsOwner(preschool);
    const result = await call<AdmitChildView>(admitChild, {
      body: form(overrides),
    });
    expect(result.status, JSON.stringify(result.body)).toBe(
      StatusCodes.CREATED,
    );
    return result.body;
  }

  beforeAll(async () => {
    preschool = await seedPreschool({ centres: 2 });
    other = await seedPreschool({ name: "Other Preschool" });
    await seedWorkspaceMember({
      workspaceId: preschool.workspaceId,
      userId: preschool.ownerUserId,
      role: "owner",
    });
    centreCode = (
      await prisma.preschoolCentre.findUniqueOrThrow({
        where: { id: preschool.centreId },
      })
    ).code;
    nurseryA = await addClassroom(preschool, {
      name: "Nursery A",
      capacity: 40,
    });
    nurseryB = await addClassroom(preschool, {
      name: "Nursery B",
      capacity: 40,
    });
    nurseryFull = await addClassroom(preschool, {
      name: "Nursery Full",
      capacity: 1,
    });
    const nextYear = await addNextAcademicYear(preschool);
    lkgNextYear = await addClassroomIn(preschool, {
      academicYearId: nextYear,
      programme: "LKG",
      name: "LKG A",
    });
    branchNursery = await addClassroom(preschool, {
      centreId: preschool.centreIds[1],
      name: "Branch Nursery",
    });
    ({ childId: seededChildId } = await addChild(preschool, {
      classroomId: nurseryFull,
      firstName: "Zoya",
      motherEmail: "zoya-mother@example.test",
    }));
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher@example.test",
      classroomIds: [nurseryB],
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "branch-head@example.test",
      centreId: preschool.centreIds[1],
    });
    otherClassroomId = await addClassroom(other);
    ({ childId: otherChildId } = await addChild(other, {
      classroomId: otherClassroomId,
    }));
  });

  beforeEach(() => {
    clearOutbox();
  });

  afterAll(async () => {
    await removePreschool(preschool);
    await removePreschool(other);
  });

  it("serves the shapes the client module is typed with", () => {
    expect(contract.every(Boolean)).toBe(true);
  });

  it("admits a Child from the whole form and invites the Parents", async () => {
    const fatherEmail = `Father-${String(Date.now())}@Example.test`;
    const { child, ageWarning } = await admit({
      father: { name: "Ravi", phone: "98400 55555", email: fatherEmail },
    });
    expect(
      AdmitPreschoolChildResponseModel.parse({ child, ageWarning }),
    ).toBeTruthy();
    expect(ageWarning).toBeNull();
    expect(child.admissionNumber).toMatch(new RegExp(`^${centreCode}-\\d{4}$`));
    expect(child).toMatchObject({
      name: "Aarav Kumar",
      status: "active",
      father: { phone: "9840055555", email: fatherEmail.toLowerCase() },
      mother: { name: "Meera", phone: null },
      address: { line: "12 Gandhi Street", city: "Chennai", state: null },
      health: { allergies: "Peanuts", immunisationUpToDate: true },
      documents: {
        hasBirthCertificate: true,
        hasAadhaar: false,
        hasPhotos: true,
      },
      authorisedPickups: [{ name: "Grandpa", phone: "9000022222" }],
      currentAdmission: {
        classroomId: nurseryA,
        classroomName: "Nursery A",
        programmeName: "Nursery (Pre-KG)",
        academicYearId: preschool.academicYearId,
        admittedOn: TODAY,
        status: "active",
      },
    });
    expect(child.admissions).toHaveLength(1);
    expect(emailsTo(fatherEmail)).toHaveLength(1);
    expect(emailsTo(fatherEmail)[0]?.text).toContain("as a Parent");
  });

  it("gives two concurrent admissions different numbers", async () => {
    signInAsOwner(preschool);
    const [first, second] = await Promise.all([
      call<AdmitChildView>(admitChild, { body: form() }),
      call<AdmitChildView>(admitChild, { body: form() }),
    ]);
    expect(first.status).toBe(StatusCodes.CREATED);
    expect(second.status).toBe(StatusCodes.CREATED);
    const numbers = [
      first.body.child.admissionNumber,
      second.body.child.admissionNumber,
    ];
    expect(new Set(numbers).size).toBe(2);
    const sequences = numbers.map((value) => Number(value.split("-").at(-1)));
    expect(Math.abs((sequences[0] ?? 0) - (sequences[1] ?? 0))).toBe(1);
  });

  it("warns, never refuses, when the Child's age is outside the Programme", async () => {
    const { ageWarning } = await admit({
      child: { dateOfBirth: "2024-01-15" },
    });
    expect(ageWarning).toContain("younger than Nursery (Pre-KG)");
  });

  it("converts an open Enquiry of the same Centre into the Admission", async () => {
    const enquiryId = await addEnquiry(preschool);
    const { child } = await admit({ admission: { enquiryId } });
    expect(child.enquiryId).toBe(enquiryId);
    const enquiry = await prisma.preschoolEnquiry.findUniqueOrThrow({
      where: { id: enquiryId },
      include: { activities: true },
    });
    expect(enquiry).toMatchObject({
      status: "admitted",
      convertedChildId: child.id,
    });
    expect(enquiry.convertedAt).not.toBeNull();
    expect(enquiry.activities).toMatchObject([
      { kind: "status_change", toStatus: "admitted" },
    ]);

    signInAsOwner(preschool);
    const again = await call(admitChild, {
      body: form({ admission: { enquiryId } }),
    });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(again.body.code).toBe("ENQUIRY_ALREADY_ADMITTED");

    const lost = await addEnquiry(preschool, { status: "lost" });
    expect(
      (
        await call(admitChild, {
          body: form({ admission: { enquiryId: lost } }),
        })
      ).body.code,
    ).toBe("ENQUIRY_LOST");
    const elsewhere = await addEnquiry(preschool, {
      centreId: preschool.centreIds[1],
    });
    expect(
      (
        await call(admitChild, {
          body: form({ admission: { enquiryId: elsewhere } }),
        })
      ).body.code,
    ).toBe("ENQUIRY_OTHER_CENTRE");
    const foreign = await addEnquiry(other);
    expect(
      (
        await call(admitChild, {
          body: form({ admission: { enquiryId: foreign } }),
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses an admission without a parent phone, with a bad phone, or into a wrong Classroom", async () => {
    signInAsOwner(preschool);
    const noPhone = await call(admitChild, {
      body: form({ father: { name: "Ravi" }, mother: null }),
    });
    expect(noPhone.status).toBe(StatusCodes.BAD_REQUEST);
    expect(noPhone.body.code).toBe("PARENT_PHONE_REQUIRED");

    const badPhone = await call(admitChild, {
      body: form({ father: { phone: "12345" } }),
    });
    expect(badPhone.body.code).toBe("PHONE_INVALID");

    const otherProgramme = await call(admitChild, {
      body: form({ admission: { classroomId: lkgNextYear } }),
    });
    expect(otherProgramme.body.code).toBe("CLASSROOM_PROGRAMME_MISMATCH");

    const otherCentre = await call(admitChild, {
      body: form({ admission: { classroomId: branchNursery } }),
    });
    expect(otherCentre.body.code).toBe("CLASSROOM_OTHER_CENTRE");

    const archived = await addClassroomIn(preschool, {
      programme: "Nursery (Pre-KG)",
      name: "Old Nursery",
      archived: true,
    });
    const archivedResult = await call(admitChild, {
      body: form({ admission: { classroomId: archived } }),
    });
    expect(archivedResult.status).toBe(StatusCodes.CONFLICT);
    expect(archivedResult.body.code).toBe("CLASSROOM_ARCHIVED");

    const full = await call(admitChild, {
      body: form({ admission: { classroomId: nurseryFull } }),
    });
    expect(full.status).toBe(StatusCodes.CONFLICT);
    expect(full.body).toMatchObject({
      code: "CLASSROOM_FULL",
      details: { capacity: 1, filled: 1, seatsLeft: 0 },
    });
  });

  it("refuses Teachers, Parents and Centre Heads of another Centre, and answers 404 across Workspaces", async () => {
    signInWithEmail(preschool, "teacher", "teacher@example.test");
    expect((await call(admitChild, { body: form() })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    signInWithEmail(preschool, "parent", "zoya-mother@example.test");
    expect(
      (await call(listChildren, { query: { centreId: preschool.centreId } }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);

    signInWithEmail(preschool, "teacher", "branch-head@example.test");
    const list = await call(listChildren, {
      query: { centreId: preschool.centreId },
    });
    expect(list.body.code).toBe("CENTRE_FORBIDDEN");
    const admitted = await call(admitChild, { body: form() });
    expect(admitted.body.code).toBe("CENTRE_FORBIDDEN");
    const read = await call(getChild, { id: seededChildId });
    expect(read.body.code).toBe("CENTRE_FORBIDDEN");
    const write = await call(withdraw, {
      id: seededChildId,
      body: { withdrawnOn: TODAY, reason: "x" },
    });
    expect(write.body.code).toBe("CENTRE_FORBIDDEN");

    signInAsOwner(preschool);
    expect((await call(getChild, { id: otherChildId })).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const foreignWrite = await call(updateHealth, {
      id: otherChildId,
      body: { health: {} },
    });
    expect(foreignWrite.status).toBe(StatusCodes.NOT_FOUND);
    expect(foreignWrite.body.code).toBe("CHILD_NOT_FOUND");
    const foreignClassroom = await call(admitChild, {
      body: form({ admission: { classroomId: otherClassroomId } }),
    });
    expect(foreignClassroom.status).toBe(StatusCodes.NOT_FOUND);

    signOut();
    expect((await call(getChild, { id: seededChildId })).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("shows a Teacher only the Children of their Classrooms", async () => {
    const { child: inB } = await admit({
      child: { firstName: "Bina" },
      admission: { classroomId: nurseryB },
    });
    signInWithEmail(preschool, "teacher", "teacher@example.test");
    const list = await call<ChildPageView>(listChildren, {
      query: { centreId: preschool.centreId },
    });
    expect(list.status).toBe(StatusCodes.OK);
    expect(list.body.items.map((item) => item.id)).toEqual([inB.id]);
    expect(list.body.total).toBe(1);

    const otherRoom = await call(listChildren, {
      query: { centreId: preschool.centreId, classroomId: nurseryA },
    });
    expect(otherRoom.body.code).toBe("CLASSROOM_FORBIDDEN");

    const own = await call<ChildProfileView>(getChild, { id: inB.id });
    expect(own.status).toBe(StatusCodes.OK);
    const notOwn = await call(getChild, { id: seededChildId });
    expect(notOwn.status).toBe(StatusCodes.FORBIDDEN);
    expect(notOwn.body.code).toBe("CHILD_FORBIDDEN");
  });

  it("lets a Parent read only their own Child", async () => {
    signInWithEmail(preschool, "parent", "zoya-mother@example.test");
    const own = await call<ChildProfileView>(getChild, { id: seededChildId });
    expect(own.status).toBe(StatusCodes.OK);
    expect(PreschoolChildProfileModel.parse(own.body)).toBeTruthy();
    const { child } = await admit();
    signInWithEmail(preschool, "parent", "zoya-mother@example.test");
    const notOwn = await call(getChild, { id: child.id });
    expect(notOwn.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("lists by first name with a total, filters and forward paging", async () => {
    const centreId = preschool.centreIds[1] ?? "";
    signInAsOwner(preschool);
    const names = ["Charu", "Anu", "Devi", "Bala"];
    for (const firstName of names)
      expect(
        (
          await call(admitChild, {
            body: form({
              rest: { centreId },
              child: { firstName, lastName: null },
              admission: { classroomId: branchNursery },
            }),
          })
        ).status,
      ).toBe(StatusCodes.CREATED);

    const first = await call<ChildPageView>(listChildren, {
      query: { centreId, limit: "3" },
    });
    expect(ListPreschoolChildrenResponseModel.parse(first.body)).toBeTruthy();
    expect(first.body.total).toBe(4);
    expect(first.body.items.map((item) => item.name)).toEqual([
      "Anu",
      "Bala",
      "Charu",
    ]);
    expect(first.body.items[0]).toMatchObject({
      classroomName: "Branch Nursery",
      programmeName: "Nursery (Pre-KG)",
      ageText: expect.stringMatching(/^3 y/) as unknown,
    });
    const second = await call<ChildPageView>(listChildren, {
      query: { centreId, limit: "3", cursor: first.body.nextCursor ?? "" },
    });
    expect(second.body.items.map((item) => item.name)).toEqual(["Devi"]);
    expect(second.body.nextCursor).toBeNull();

    const searched = await call<ChildPageView>(listChildren, {
      query: { centreId, q: "dev" },
    });
    expect(searched.body.items.map((item) => item.name)).toEqual(["Devi"]);

    const devi = searched.body.items[0]?.id ?? "";
    await call(withdraw, {
      id: devi,
      body: { withdrawnOn: TODAY, reason: "Moved city" },
    });
    const active = await call<ChildPageView>(listChildren, {
      query: { centreId },
    });
    expect(active.body.total).toBe(3);
    const withdrawn = await call<ChildPageView>(listChildren, {
      query: { centreId, status: "withdrawn" },
    });
    expect(withdrawn.body.items.map((item) => item.id)).toEqual([devi]);
    const all = await call<ChildPageView>(listChildren, {
      query: { centreId, status: "all" },
    });
    expect(all.body.total).toBe(4);
  });

  it("edits each section, inviting only new parent emails and refusing a stale form", async () => {
    const { child } = await admit({
      father: { phone: nextPhone(), email: "dad-edit@example.test" },
    });
    clearOutbox();
    signInAsOwner(preschool);
    const profile = await call<ChildProfileView>(updateProfile, {
      id: child.id,
      body: {
        firstName: "Aaru",
        dateOfBirth: "2023-04-01",
        gender: "boy",
        address: { city: "Madurai" },
        updatedAt: child.updatedAt,
      },
    });
    expect(profile.status).toBe(StatusCodes.OK);
    expect(profile.body).toMatchObject({
      name: "Aaru",
      lastName: null,
      address: { city: "Madurai", line: null },
    });

    const stale = await call(updateHealth, {
      id: child.id,
      body: { health: {}, updatedAt: child.updatedAt },
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(stale.body.code).toBe("CHILD_CHANGED");

    const parents = await call<ChildProfileView>(updateParents, {
      id: child.id,
      body: {
        father: { phone: child.father.phone, email: "DAD-edit@example.test" },
        mother: { name: "Meera", email: "mum-edit@example.test" },
        emergencyContact: { name: "Uncle", phone: "044 2345 6789" },
      },
    });
    expect(parents.body).toMatchObject({
      mother: { email: "mum-edit@example.test" },
      emergencyContact: { name: "Uncle", phone: "044 2345 6789" },
    });
    expect(emailsTo("dad-edit@example.test")).toHaveLength(0);
    expect(emailsTo("mum-edit@example.test")).toHaveLength(1);

    const health = await call<ChildProfileView>(updateHealth, {
      id: child.id,
      body: {
        health: { medicalConditions: "Asthma" },
        documents: { hasAadhaar: true },
      },
    });
    expect(health.body).toMatchObject({
      health: { medicalConditions: "Asthma", allergies: null },
      documents: { hasAadhaar: true, hasBirthCertificate: false },
    });

    const pickups = await call<ChildProfileView>(replacePickups, {
      id: child.id,
      body: {
        authorisedPickups: [
          { name: "Driver", relationship: "Driver", phone: "9000033333" },
          { name: "Aunt", relationship: "Aunt", phone: "+91 90000 44444" },
        ],
      },
    });
    expect(pickups.body.authorisedPickups.map((pickup) => pickup.name)).toEqual(
      ["Driver", "Aunt"],
    );
    const seven = Array.from({ length: 7 }, () => ({
      name: "P",
      relationship: "R",
      phone: "9000055555",
    }));
    const tooMany = await call(replacePickups, {
      id: child.id,
      body: { authorisedPickups: seven },
    });
    expect(tooMany.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("moves a Child between Classrooms, keeping the history", async () => {
    const { child } = await admit();
    signInAsOwner(preschool);
    const moved = await call<ChildProfileView>(moveClassroom, {
      id: child.id,
      body: { classroomId: nurseryB },
    });
    expect(moved.status).toBe(StatusCodes.OK);
    expect(moved.body.currentAdmission).toMatchObject({
      classroomId: nurseryB,
      status: "active",
    });
    expect(moved.body.admissions).toHaveLength(2);
    expect(moved.body.admissions[1]).toMatchObject({
      classroomId: nurseryA,
      status: "ended",
      endReason: "classroom_changed",
      endedOn: TODAY,
    });

    const same = await call(moveClassroom, {
      id: child.id,
      body: { classroomId: nurseryB },
    });
    expect(same.body.code).toBe("SAME_CLASSROOM");
    const full = await call(moveClassroom, {
      id: child.id,
      body: { classroomId: nurseryFull },
    });
    expect(full.body.code).toBe("CLASSROOM_FULL");
    const otherYear = await call(moveClassroom, {
      id: child.id,
      body: { classroomId: lkgNextYear },
    });
    expect(otherYear.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("promotes a Child into a later Academic Year", async () => {
    const { child } = await admit();
    signInAsOwner(preschool);
    const lkg = preschool.programmeIds["LKG"] ?? "";
    const sameYear = await call(promote, {
      id: child.id,
      body: { programmeId: nursery(), classroomId: nurseryB },
    });
    expect(sameYear.body.code).toBe("PROMOTION_YEAR_NOT_LATER");

    const promoted = await call<AdmitChildView>(promote, {
      id: child.id,
      body: { programmeId: lkg, classroomId: lkgNextYear },
    });
    expect(promoted.status).toBe(StatusCodes.OK);
    expect(promoted.body.child.currentAdmission).toMatchObject({
      classroomId: lkgNextYear,
      programmeName: "LKG",
      academicYearName: "2027–28",
      admittedOn: "2027-04-01",
    });
    expect(promoted.body.child.admissions[1]).toMatchObject({
      endReason: "promoted",
      status: "ended",
    });
    expect(promoted.body.ageWarning).toBeNull();
  });

  it("withdraws a Child, after which the record can only be read", async () => {
    const { child } = await admit();
    signInAsOwner(preschool);
    const early = await call(withdraw, {
      id: child.id,
      body: { withdrawnOn: "2020-01-01", reason: "Moved" },
    });
    expect(early.body.code).toBe("DATE_BEFORE_ADMISSION");

    const withdrawn = await call<ChildProfileView>(withdraw, {
      id: child.id,
      body: { withdrawnOn: TODAY, reason: "Family moved to Bengaluru" },
    });
    expect(withdrawn.body).toMatchObject({
      status: "withdrawn",
      withdrawnOn: TODAY,
      withdrawReason: "Family moved to Bengaluru",
      currentAdmission: null,
    });
    expect(withdrawn.body.admissions[0]).toMatchObject({
      endReason: "withdrawn",
      endedOn: TODAY,
    });

    for (const [handler, body] of [
      [
        updateProfile,
        { firstName: "X", dateOfBirth: "2023-01-01", gender: "boy" },
      ],
      [updateParents, { father: { phone: "9876500000" } }],
      [updateHealth, {}],
      [replacePickups, { authorisedPickups: [] }],
      [moveClassroom, { classroomId: nurseryB }],
      [promote, { programmeId: nursery(), classroomId: lkgNextYear }],
      [withdraw, { withdrawnOn: TODAY, reason: "again" }],
    ] as const) {
      const result = await call(handler, { id: child.id, body });
      expect(result.status).toBe(StatusCodes.CONFLICT);
      expect(result.body.code).toBe("CHILD_NOT_ACTIVE");
    }
    expect((await call(getChild, { id: child.id })).status).toBe(
      StatusCodes.OK,
    );
  });

  it("lists siblings sharing a parent phone or email", async () => {
    const phone = nextPhone();
    const { child: elder } = await admit({
      child: { firstName: "Elder" },
      father: { phone },
    });
    const { child: younger } = await admit({
      child: { firstName: "Younger" },
      father: { phone: null },
      mother: { phone: "9811100000", email: "sibling-mum@example.test" },
    });
    await prisma.preschoolChild.update({
      where: { id: younger.id },
      data: { fatherPhone: phone },
    });
    signInAsOwner(preschool);
    const read = await call<ChildProfileView>(getChild, { id: elder.id });
    expect(read.body.siblings).toEqual([
      {
        id: younger.id,
        name: "Younger Kumar",
        classroomName: "Nursery A",
        status: "active",
      },
    ]);
  });

  it("shows siblings only where the reader may open them", async () => {
    const phone = nextPhone();
    const sibling = (
      firstName: string,
      classroomId: string,
      centreId = preschool.centreId,
    ) =>
      admit({
        child: { firstName, lastName: null },
        father: { phone },
        admission: { classroomId },
        rest: { centreId },
      });
    const { child: xavi } = await sibling("Xavi", nurseryB);
    await sibling("Sia", nurseryA);
    await sibling("Tara", nurseryB);
    const { child: sam } = await sibling(
      "Sam",
      branchNursery,
      preschool.centreIds[1],
    );
    await addStaff(preschool, {
      role: "centre_head",
      email: "main-head@example.test",
    });
    const names = async () => {
      const read = await call<ChildProfileView>(getChild, { id: xavi.id });
      expect(read.status).toBe(StatusCodes.OK);
      return read.body.siblings.map((entry) => entry.name);
    };

    signInAsOwner(preschool);
    expect(await names()).toEqual(["Sam", "Sia", "Tara"]);

    signInWithEmail(preschool, "teacher", "main-head@example.test");
    expect(await names()).toEqual(["Sia", "Tara"]);

    signInWithEmail(preschool, "teacher", "teacher@example.test");
    expect(await names()).toEqual(["Tara"]);

    signInWithEmail(preschool, "teacher", "branch-head@example.test");
    const fromBranch = await call<ChildProfileView>(getChild, { id: sam.id });
    expect(fromBranch.body.siblings).toEqual([]);
  });

  it("offers the Centre's Classrooms with seats left, Programmes and years", async () => {
    signInAsOwner(preschool);
    const result = await call<ChildFormOptionsView>(getOptions, {
      query: { centreId: preschool.centreId },
    });
    expect(PreschoolChildOptionsResponseModel.parse(result.body)).toBeTruthy();
    expect(result.body.currentAcademicYearId).toBe(preschool.academicYearId);
    expect(result.body.academicYears.map((year) => year.name)).toEqual([
      "2026–27",
      "2027–28",
    ]);
    expect(
      result.body.programmes.find((programme) => programme.name === "LKG"),
    ).toMatchObject({ ageRangeText: "4 y – 4 y 11 m" });
    const full = result.body.classrooms.find((room) => room.id === nurseryFull);
    expect(full).toMatchObject({ capacity: 1, filled: 1, seatsLeft: 0 });
    expect(result.body.classrooms.map((room) => room.id)).not.toContain(
      branchNursery,
    );

    signInWithEmail(preschool, "teacher", "teacher@example.test");
    expect(
      (await call(getOptions, { query: { centreId: preschool.centreId } }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("raises the Fee Structure's Invoices on admission and keeps them through a Classroom move", async () => {
    const structureId = randomUUID();
    const tuition = preschool.feeHeadIds["Tuition"];
    const admissionFee = preschool.feeHeadIds["Admission fee"];
    const programmeId = preschool.programmeIds["Nursery (Pre-KG)"];
    if (tuition == null || admissionFee == null || programmeId == null)
      throw new Error("The fixture has no Tuition, Admission fee or Nursery.");
    await prisma.preschoolFeeStructure.create({
      data: {
        id: structureId,
        workspaceId: preschool.workspaceId,
        academicYearId: preschool.academicYearId,
        programmeId,
        items: {
          create: [
            {
              id: randomUUID(),
              workspaceId: preschool.workspaceId,
              feeHeadId: admissionFee,
              amountPaise: 500_000,
              frequency: "one_time",
            },
            {
              id: randomUUID(),
              workspaceId: preschool.workspaceId,
              feeHeadId: tuition,
              amountPaise: 1_200_000,
              frequency: "term",
            },
          ],
        },
      },
    });
    try {
      const { child } = await admit();
      const invoices = await prisma.preschoolInvoice.findMany({
        where: { childId: child.id },
      });
      expect(invoices.length).toBeGreaterThanOrEqual(2);
      expect(invoices.map((invoice) => invoice.label)).toContain(
        "Admission fee",
      );

      signInAsOwner(preschool);
      const moved = await call<ChildProfileView>(moveClassroom, {
        id: child.id,
        body: { classroomId: nurseryB },
      });
      const after = await prisma.preschoolInvoice.findMany({
        where: { childId: child.id },
      });
      expect(after).toHaveLength(invoices.length);
      expect(new Set(after.map((invoice) => invoice.admissionId))).toEqual(
        new Set([moved.body.currentAdmission?.id]),
      );
    } finally {
      await prisma.preschoolFeeStructure.delete({ where: { id: structureId } });
    }
  });

  it("tells the AdmissionInvoicer about admissions and promotions", async () => {
    const admitted: AdmittedChild[] = [];
    const handlers = createChildHandlers({
      invoicer: {
        onAdmitted: (admission) => {
          admitted.push(admission);
          return Promise.resolve();
        },
      },
      inviter: { invite: () => Promise.reject(new Error("mail is down")) },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const owner: PreschoolActor = {
      workspaceId: preschool.workspaceId,
      userId: preschool.ownerUserId,
      userName: "Owner",
      role: "owner",
      centreIds: preschool.centreIds,
      classroomIds: [],
      childIds: [],
    };
    const { child } = await handlers.admit(
      owner,
      form({
        father: { phone: nextPhone(), email: "down@example.test" },
      }) as AdmitChildInput,
    );
    expect(consoleError).toHaveBeenCalledWith(
      "Parent invitation failed",
      { childId: child.id },
      expect.any(Error),
    );
    consoleError.mockRestore();
    expect(admitted).toEqual([
      {
        workspaceId: preschool.workspaceId,
        admissionId: child.currentAdmission?.id,
        childId: child.id,
        centreId: preschool.centreId,
        programmeId: nursery(),
        academicYearId: preschool.academicYearId,
        admittedOn: TODAY,
      },
    ]);

    const promoted = await handlers.promote(owner, child.id, {
      programmeId: preschool.programmeIds["LKG"] ?? "",
      classroomId: lkgNextYear,
    });
    expect(admitted[1]).toMatchObject({
      admissionId: promoted.child.currentAdmission?.id,
      admittedOn: "2027-04-01",
    });
  });
});
