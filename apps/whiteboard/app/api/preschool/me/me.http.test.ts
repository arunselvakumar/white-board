import { getAuth } from "@repo/auth/server";
import { authStateFor } from "@repo/auth/testing";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { MeView } from "@/src/preschool/application/me";

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
import { GET } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

describe("GET /api/preschool/me", () => {
  let preschool: PreschoolFixture;
  let classroomId: string;
  let otherClassroomId: string;
  let childId: string;

  beforeAll(async () => {
    preschool = await seedPreschool({ centres: 3 });
    classroomId = await addClassroom(preschool);
    otherClassroomId = await addClassroom(preschool, {
      centreId: preschool.centreIds[1],
      name: "Nursery B",
    });
    await addStaff(preschool, {
      role: "centre_head",
      email: "head@example.test",
      centreId: preschool.centreIds[1],
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "teacher@example.test",
      classroomIds: [classroomId],
    });
    await addStaff(preschool, { role: "helper", email: "helper@example.test" });
    ({ childId } = await addChild(preschool, {
      classroomId,
      motherEmail: "mother@example.test",
    }));
    await addChild(preschool, { classroomId: otherClassroomId });
  });

  afterAll(async () => {
    await removePreschool(preschool);
  });

  async function me(): Promise<{ status: number; body: MeView }> {
    const response = await GET();
    return { status: response.status, body: (await response.json()) as MeView };
  }

  it("answers 401 without a Session", async () => {
    signOut();
    expect((await GET()).status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("answers 403 NOT_A_PRESCHOOL for a Workspace that was never set up as one", async () => {
    vi.mocked(getAuth).mockResolvedValue(
      authStateFor({ userId: "user_x", workspaceId: "org_training" }),
    );
    const response = await GET();
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    expect(((await response.json()) as { code: string }).code).toBe(
      "NOT_A_PRESCHOOL",
    );
  });

  it("gives the Owner every Centre and the current Academic Year", async () => {
    signInAsOwner(preschool);
    const { status, body } = await me();
    expect(status).toBe(StatusCodes.OK);
    expect(body.role).toBe("owner");
    expect(body.centres.map((centre) => centre.id).sort()).toEqual(
      [...preschool.centreIds].sort(),
    );
    expect(body.hasSeveralCentres).toBe(true);
    expect(body.currentAcademicYear).toMatchObject({
      name: "2026–27",
      startsOn: "2026-04-01",
      endsOn: "2027-03-31",
    });
  });

  it("gives a Centre Head only their Centre", async () => {
    signInWithEmail(preschool, "teacher", "head@example.test");
    const { body } = await me();
    expect(body.role).toBe("centre_head");
    expect(body.centres.map((centre) => centre.id)).toEqual([
      preschool.centreIds[1],
    ]);
  });

  it("gives a Teacher their Classrooms", async () => {
    signInWithEmail(preschool, "teacher", "Teacher@example.test");
    const { body } = await me();
    expect(body.role).toBe("teacher");
    expect(body.classroomIds).toEqual([classroomId]);
    expect(body.centres.map((centre) => centre.id)).toEqual([
      preschool.centreId,
    ]);
  });

  it("gives a Parent their own Children", async () => {
    signInWithEmail(preschool, "parent", "mother@example.test");
    const { body } = await me();
    expect(body.role).toBe("parent");
    expect(body.children.map((child) => child.id)).toEqual([childId]);
  });

  it("answers 403 for a helper, a stranger, and a Student member", async () => {
    signInWithEmail(preschool, "teacher", "helper@example.test");
    expect((await GET()).status).toBe(StatusCodes.FORBIDDEN);
    signInWithEmail(preschool, "parent", "nobody@example.test");
    expect((await GET()).status).toBe(StatusCodes.FORBIDDEN);
    signInWithEmail(preschool, "student", "mother@example.test");
    expect((await GET()).status).toBe(StatusCodes.FORBIDDEN);
  });
});
