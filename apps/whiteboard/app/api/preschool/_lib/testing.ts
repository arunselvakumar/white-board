import { randomUUID } from "node:crypto";

import { getAuth } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { prisma } from "@repo/whiteboard-db";
import { vi } from "vitest";

import { fromIsoDate } from "@/src/preschool/domain/dates";
import { createSetUpPreschool } from "@/src/preschool/infrastructure/prisma-setup-store";

// Fixtures for Preschool HTTP tests. A test file mocks `getAuth` itself:
//
//   vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
//     ...(await importOriginal()),
//     getAuth: vi.fn(),
//   }));
//
// then seeds a Preschool and signs in as whoever the case needs.

/** "Now" for seeded data: inside the 2026–27 Academic Year. */
export const FIXTURE_NOW = new Date("2026-11-25T04:30:00Z");

export type PreschoolFixture = {
  workspaceId: string;
  ownerUserId: string;
  /** The first Centre, created by setup. */
  centreId: string;
  centreIds: string[];
  academicYearId: string;
  /** By name: Playgroup, Nursery (Pre-KG), LKG, UKG, Daycare. */
  programmeIds: Record<string, string>;
  /** By name: Admission fee, Tuition, Kit & books, … */
  feeHeadIds: Record<string, string>;
  domainIds: string[];
};

/**
 * A new Preschool Workspace as Workspace Creation leaves it, with `centres`
 * Centres (the first company-owned, the rest franchised at 10% royalty).
 */
export async function seedPreschool(options?: {
  centres?: number;
  academicYearStartMonth?: number;
  name?: string;
}): Promise<PreschoolFixture> {
  const workspaceId = `org_${randomUUID()}`;
  const ownerUserId = `user_${randomUUID()}`;
  const name = options?.name ?? "Little Steps";
  const setup = await createSetUpPreschool({ now: () => FIXTURE_NOW }).execute({
    workspaceId,
    name,
    academicYearStartMonth: options?.academicYearStartMonth,
  });
  const centreIds = [setup.centreId];
  for (let index = 1; index < (options?.centres ?? 1); index += 1) {
    const id = randomUUID();
    await prisma.preschoolCentre.create({
      data: {
        id,
        workspaceId,
        name: `${name} Branch ${index + 1}`,
        code: `B${index + 1}`,
        ownership: "franchised",
        franchiseeName: `Franchisee ${index + 1}`,
        royaltyBps: 1000,
      },
    });
    centreIds.push(id);
  }
  const [programmes, feeHeads, domains] = await Promise.all([
    prisma.preschoolProgramme.findMany({ where: { workspaceId } }),
    prisma.preschoolFeeHead.findMany({ where: { workspaceId } }),
    prisma.preschoolDevelopmentDomain.findMany({
      where: { workspaceId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return {
    workspaceId,
    ownerUserId,
    centreId: setup.centreId,
    centreIds,
    academicYearId: setup.academicYearId,
    programmeIds: Object.fromEntries(
      programmes.map((row) => [row.name, row.id]),
    ),
    feeHeadIds: Object.fromEntries(feeHeads.map((row) => [row.name, row.id])),
    domainIds: domains.map((row) => row.id),
  };
}

export function signInAsOwner(fixture: PreschoolFixture): void {
  vi.mocked(getAuth).mockResolvedValue(
    authStateFor({
      userId: fixture.ownerUserId,
      workspaceId: fixture.workspaceId,
      role: "owner",
      name: "Owner",
    }),
  );
}

/** Signs in a Workspace member with role `teacher` (Staff) or `parent`, linked by this email. */
export function signInWithEmail(
  fixture: PreschoolFixture,
  memberRole: "teacher" | "parent" | "student",
  email: string,
): string {
  const userId = `user_${randomUUID()}`;
  vi.mocked(getAuth).mockResolvedValue(
    authStateFor({
      userId,
      workspaceId: fixture.workspaceId,
      role: memberRole,
      email,
      emailVerified: true,
      name: email.split("@")[0] ?? email,
    }),
  );
  return userId;
}

export function signOut(): void {
  vi.mocked(getAuth).mockResolvedValue(
    authStateFor({ userId: null, workspaceId: null }),
  );
}

export async function addClassroom(
  fixture: PreschoolFixture,
  input?: {
    centreId?: string;
    programme?: string;
    name?: string;
    capacity?: number;
  },
): Promise<string> {
  const id = randomUUID();
  const programmeId =
    fixture.programmeIds[input?.programme ?? "Nursery (Pre-KG)"];
  if (programmeId == null) throw new Error("Unknown Programme");
  await prisma.preschoolClassroom.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      centreId: input?.centreId ?? fixture.centreId,
      academicYearId: fixture.academicYearId,
      programmeId,
      name: input?.name ?? "Nursery A",
      capacity: input?.capacity ?? 20,
    },
  });
  return id;
}

/** A Staff record; pass `classroomIds` to make a Teacher the Class Teacher there. */
export async function addStaff(
  fixture: PreschoolFixture,
  input: {
    role: "centre_head" | "teacher" | "helper";
    email?: string;
    centreId?: string;
    name?: string;
    classroomIds?: string[];
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.preschoolStaff.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      centreId: input.centreId ?? fixture.centreId,
      name: input.name ?? "Staff Member",
      role: input.role,
      email: input.email?.toLowerCase() ?? null,
      classrooms: {
        create: (input.classroomIds ?? []).map((classroomId) => ({
          classroomId,
          workspaceId: fixture.workspaceId,
        })),
      },
    },
  });
  return id;
}

let childSequence = 0;

/** A Child with an active Admission in `classroomId`. Returns both ids. */
export async function addChild(
  fixture: PreschoolFixture,
  input: {
    classroomId: string;
    centreId?: string;
    firstName?: string;
    dateOfBirth?: string;
    fatherEmail?: string;
    motherEmail?: string;
    fatherPhone?: string;
  },
): Promise<{ childId: string; admissionId: string }> {
  const classroom = await prisma.preschoolClassroom.findUniqueOrThrow({
    where: { id: input.classroomId },
  });
  childSequence += 1;
  const childId = randomUUID();
  const admissionId = randomUUID();
  await prisma.preschoolChild.create({
    data: {
      id: childId,
      workspaceId: fixture.workspaceId,
      centreId: input.centreId ?? classroom.centreId,
      admissionNumber: `T-${randomUUID().slice(0, 8)}-${childSequence}`,
      firstName: input.firstName ?? `Child ${childSequence}`,
      dateOfBirth: fromIsoDate(input.dateOfBirth ?? "2023-03-10"),
      gender: "girl",
      fatherName: "Father",
      fatherPhone: input.fatherPhone ?? "9876543210",
      fatherEmail: input.fatherEmail?.toLowerCase() ?? null,
      motherName: "Mother",
      motherEmail: input.motherEmail?.toLowerCase() ?? null,
      admissions: {
        create: {
          id: admissionId,
          workspaceId: fixture.workspaceId,
          centreId: classroom.centreId,
          academicYearId: classroom.academicYearId,
          programmeId: classroom.programmeId,
          classroomId: classroom.id,
          admittedOn: fromIsoDate("2026-06-01"),
        },
      },
    },
  });
  return { childId, admissionId };
}

/** Removes everything a fixture wrote. Call from `afterAll`. */
export async function removePreschool(
  fixture: PreschoolFixture,
): Promise<void> {
  const { workspaceId } = fixture;
  const where = { where: { workspaceId } };
  await prisma.preschoolStockMovement.deleteMany(where);
  await prisma.preschoolStockItem.deleteMany(where);
  await prisma.preschoolProgressReportRating.deleteMany(where);
  await prisma.preschoolProgressReport.deleteMany(where);
  await prisma.preschoolObservation.deleteMany(where);
  await prisma.preschoolDevelopmentDomain.deleteMany(where);
  await prisma.preschoolAnnouncement.deleteMany(where);
  await prisma.preschoolFeePaymentAllocation.deleteMany(where);
  await prisma.preschoolFeePayment.deleteMany(where);
  await prisma.preschoolInvoice.deleteMany(where);
  await prisma.preschoolFeeStructureItem.deleteMany(where);
  await prisma.preschoolFeeStructure.deleteMany(where);
  await prisma.preschoolFeeHead.deleteMany(where);
  await prisma.preschoolDailyReport.deleteMany(where);
  await prisma.preschoolAttendance.deleteMany(where);
  await prisma.preschoolAdmission.deleteMany(where);
  await prisma.preschoolAuthorisedPickup.deleteMany(where);
  await prisma.preschoolEnquiryActivity.deleteMany(where);
  await prisma.preschoolEnquiry.deleteMany(where);
  await prisma.preschoolChild.deleteMany(where);
  await prisma.preschoolClassroomTeacher.deleteMany(where);
  await prisma.preschoolStaff.deleteMany(where);
  await prisma.preschoolClassroom.deleteMany(where);
  await prisma.preschoolProgramme.deleteMany(where);
  await prisma.preschoolAcademicYear.deleteMany(where);
  await prisma.preschoolCentre.deleteMany(where);
  await prisma.preschoolSettings.deleteMany(where);
}
