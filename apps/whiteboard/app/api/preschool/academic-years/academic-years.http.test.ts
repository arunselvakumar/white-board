import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  AcademicYearListView,
  AcademicYearView,
} from "@/src/preschool/application/academic-year-views";

import {
  addClassroom,
  addChild,
  addStaff,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  signInWithEmail,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as makeCurrent } from "./[id]/make-current/route";
import { GET, POST } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function list(): Promise<AcademicYearView[]> {
  const response = await GET();
  expect(response.status).toBe(StatusCodes.OK);
  return ((await response.json()) as AcademicYearListView).items;
}

describe("/api/preschool/academic-years", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;

  beforeAll(async () => {
    [preschool, other] = await Promise.all([
      seedPreschool({ academicYearStartMonth: 6 }),
      seedPreschool({ name: "Other School" }),
    ]);
    const classroomId = await addClassroom(preschool);
    await addStaff(preschool, {
      role: "centre_head",
      email: "ay-head@example.test",
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "ay-teacher@example.test",
      classroomIds: [classroomId],
    });
    await addChild(preschool, {
      classroomId,
      motherEmail: "ay-mother@example.test",
    });
  });

  afterAll(async () => {
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  it("lists the seeded year as current, to every role", async () => {
    signInAsOwner(preschool);
    expect(await list()).toEqual([
      {
        id: preschool.academicYearId,
        name: "2026–27",
        startsOn: "2026-06-01",
        endsOn: "2027-05-31",
        isCurrent: true,
      },
    ]);
    for (const [role, email] of [
      ["teacher", "ay-head@example.test"],
      ["teacher", "ay-teacher@example.test"],
      ["parent", "ay-mother@example.test"],
    ] as const) {
      signInWithEmail(preschool, role, email);
      expect((await list()).map((year) => year.id)).toEqual([
        preschool.academicYearId,
      ]);
    }
  });

  it("lets only the Owner add a year", async () => {
    signInWithEmail(preschool, "teacher", "ay-head@example.test");
    expect((await POST()).status).toBe(StatusCodes.FORBIDDEN);
    signInWithEmail(preschool, "parent", "ay-mother@example.test");
    expect((await POST()).status).toBe(StatusCodes.FORBIDDEN);
  });

  it("adds the year after the latest on the Workspace's start month", async () => {
    signInAsOwner(preschool);
    const first = await POST();
    expect(first.status).toBe(StatusCodes.CREATED);
    expect(await first.json()).toMatchObject({
      name: "2027–28",
      startsOn: "2027-06-01",
      endsOn: "2028-05-31",
      isCurrent: false,
    });
    const second = await POST();
    expect(((await second.json()) as AcademicYearView).name).toBe("2028–29");
    expect((await list()).map((year) => year.name)).toEqual([
      "2028–29",
      "2027–28",
      "2026–27",
    ]);
  });

  it("makes exactly one year current", async () => {
    signInAsOwner(preschool);
    const next = (await list()).find((year) => year.name === "2027–28");
    if (next == null) throw new Error("2027–28 was not added");
    const response = await makeCurrent(
      new Request("http://localhost"),
      idContext(next.id),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await response.json()).toMatchObject({
      id: next.id,
      isCurrent: true,
    });
    expect(
      (await list()).filter((year) => year.isCurrent).map((year) => year.id),
    ).toEqual([next.id]);

    await makeCurrent(
      new Request("http://localhost"),
      idContext(preschool.academicYearId),
    );
    expect(
      (await list()).filter((year) => year.isCurrent).map((year) => year.id),
    ).toEqual([preschool.academicYearId]);
  });

  it("answers 403 to a Centre Head and 404 for another Workspace's year", async () => {
    signInWithEmail(preschool, "teacher", "ay-head@example.test");
    expect(
      (
        await makeCurrent(
          new Request("http://localhost"),
          idContext(preschool.academicYearId),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    signInAsOwner(preschool);
    const response = await makeCurrent(
      new Request("http://localhost"),
      idContext(other.academicYearId),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    signInAsOwner(other);
    expect((await list())[0]?.isCurrent).toBe(true);
  });
});
