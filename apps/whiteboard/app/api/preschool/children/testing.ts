import { randomUUID } from "node:crypto";

import { prisma } from "@repo/whiteboard-db";

import { fromIsoDate } from "@/src/preschool/domain/dates";

import type { PreschoolFixture } from "../_lib/testing";

// Fixtures the Child and Admission tests need beyond `_lib/testing.ts`.
// `removePreschool` cleans up everything written here.

/** The Academic Year after the fixture's current one (2027–28). */
export async function addNextAcademicYear(
  fixture: PreschoolFixture,
): Promise<string> {
  const id = randomUUID();
  await prisma.preschoolAcademicYear.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      name: "2027–28",
      startsOn: fromIsoDate("2027-04-01"),
      endsOn: fromIsoDate("2028-03-31"),
    },
  });
  return id;
}

/** A Classroom in any Academic Year, optionally archived. */
export async function addClassroomIn(
  fixture: PreschoolFixture,
  input: {
    academicYearId?: string;
    programme: string;
    name: string;
    capacity?: number;
    centreId?: string;
    archived?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  const programmeId = fixture.programmeIds[input.programme];
  if (programmeId == null) throw new Error("Unknown Programme");
  await prisma.preschoolClassroom.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      centreId: input.centreId ?? fixture.centreId,
      academicYearId: input.academicYearId ?? fixture.academicYearId,
      programmeId,
      name: input.name,
      capacity: input.capacity ?? 20,
      archivedAt: input.archived === true ? new Date() : null,
    },
  });
  return id;
}

/** An Enquiry straight in the table, so the tests do not depend on its routes. */
export async function addEnquiry(
  fixture: PreschoolFixture,
  input: {
    centreId?: string;
    status?: "new" | "visited" | "lost" | "admitted";
    childName?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.preschoolEnquiry.create({
    data: {
      id,
      workspaceId: fixture.workspaceId,
      centreId: input.centreId ?? fixture.centreId,
      createdByUserId: fixture.ownerUserId,
      childName: input.childName ?? "Enquiry child",
      parentName: "Enquiring parent",
      parentPhone: "9123456780",
      status: input.status ?? "visited",
    },
  });
  return id;
}
