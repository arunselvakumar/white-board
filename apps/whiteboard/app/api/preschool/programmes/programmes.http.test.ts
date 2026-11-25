import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  ProgrammeListView,
  ProgrammeView,
} from "@/src/preschool/application/programme-views";

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
import { POST as restore } from "./[id]/restore/route";
import { POST as reorder } from "./reorder/route";
import { GET, POST } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/preschool/programmes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function list(includeArchived = false): Promise<ProgrammeView[]> {
  const response = await GET(
    new Request(
      `http://localhost/api/preschool/programmes?includeArchived=${includeArchived}`,
    ),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return ((await response.json()) as ProgrammeListView).items;
}

async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

describe("/api/preschool/programmes", () => {
  let preschool: PreschoolFixture;
  let other: PreschoolFixture;

  beforeAll(async () => {
    [preschool, other] = await Promise.all([
      seedPreschool(),
      seedPreschool({ name: "Other School" }),
    ]);
    const classroomId = await addClassroom(preschool, { programme: "LKG" });
    await addStaff(preschool, {
      role: "centre_head",
      email: "pg-head@example.test",
    });
    await addStaff(preschool, {
      role: "teacher",
      email: "pg-teacher@example.test",
      classroomIds: [classroomId],
    });
    await addChild(preschool, {
      classroomId,
      fatherEmail: "pg-father@example.test",
    });
  });

  afterAll(async () => {
    await Promise.all([removePreschool(preschool), removePreschool(other)]);
  });

  it("lists the seeded Programmes in order to every role", async () => {
    signInAsOwner(preschool);
    const names = [
      "Playgroup",
      "Nursery (Pre-KG)",
      "LKG",
      "UKG",
      "Daycare",
    ] as const;
    expect((await list()).map((programme) => programme.name)).toEqual(names);
    for (const [role, email] of [
      ["teacher", "pg-head@example.test"],
      ["teacher", "pg-teacher@example.test"],
      ["parent", "pg-father@example.test"],
    ] as const) {
      signInWithEmail(preschool, role, email);
      expect((await list()).map((programme) => programme.name)).toEqual(names);
    }
  });

  it("lets only the Owner add a Programme", async () => {
    signInWithEmail(preschool, "teacher", "pg-head@example.test");
    const response = await POST(jsonRequest({ name: "Toddlers" }));
    expect(response.status).toBe(StatusCodes.FORBIDDEN);
    signInWithEmail(preschool, "teacher", "pg-teacher@example.test");
    expect((await POST(jsonRequest({ name: "Toddlers" }))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("adds a Programme last, with a trimmed name", async () => {
    signInAsOwner(preschool);
    const response = await POST(
      jsonRequest({
        name: "  Toddlers ",
        minAgeMonths: 12,
        maxAgeMonths: 24,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    expect(await response.json()).toMatchObject({
      name: "Toddlers",
      minAgeMonths: 12,
      maxAgeMonths: 24,
      isDaycare: false,
      sortOrder: 5,
      isArchived: false,
    });
  });

  it("refuses a duplicate name and a reversed age range", async () => {
    signInAsOwner(preschool);
    const duplicate = await POST(jsonRequest({ name: "lkg" }));
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(duplicate)).toBe("PROGRAMME_NAME_IN_USE");
    const reversed = await POST(
      jsonRequest({ name: "Juniors", minAgeMonths: 40, maxAgeMonths: 30 }),
    );
    expect(reversed.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(reversed)).toBe("PROGRAMME_AGE_RANGE_INVALID");
  });

  it("changes details, keeping names unique", async () => {
    signInAsOwner(preschool);
    const ukg = preschool.programmeIds["UKG"] ?? "";
    const response = await details(
      jsonRequest({
        name: "Senior KG",
        minAgeMonths: 60,
        maxAgeMonths: 72,
      }),
      idContext(ukg),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await response.json()).toMatchObject({
      id: ukg,
      name: "Senior KG",
      maxAgeMonths: 72,
    });
    const clash = await details(jsonRequest({ name: "LKG" }), idContext(ukg));
    expect(clash.status).toBe(StatusCodes.CONFLICT);
  });

  it("refuses to archive a Programme with Classrooms this year", async () => {
    signInAsOwner(preschool);
    const response = await archive(
      new Request("http://localhost"),
      idContext(preschool.programmeIds["LKG"] ?? ""),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await response.json()).toMatchObject({
      code: "PROGRAMME_HAS_CLASSROOMS",
      message: expect.stringContaining("1 Classroom") as unknown,
    });
  });

  it("archives and restores; a restored name must still be free", async () => {
    signInAsOwner(preschool);
    const daycare = preschool.programmeIds["Daycare"] ?? "";
    const archived = await archive(
      new Request("http://localhost"),
      idContext(daycare),
    );
    expect(archived.status).toBe(StatusCodes.OK);
    expect(((await archived.json()) as ProgrammeView).isArchived).toBe(true);
    expect((await list()).map((programme) => programme.id)).not.toContain(
      daycare,
    );
    expect((await list(true)).map((programme) => programme.id)).toContain(
      daycare,
    );

    const replacement = await POST(
      jsonRequest({ name: "Daycare", isDaycare: true }),
    );
    expect(replacement.status).toBe(StatusCodes.CREATED);
    const clash = await restore(
      new Request("http://localhost"),
      idContext(daycare),
    );
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(clash)).toBe("PROGRAMME_NAME_IN_USE");

    await archive(
      new Request("http://localhost"),
      idContext(((await replacement.json()) as ProgrammeView).id),
    );
    const restored = await restore(
      new Request("http://localhost"),
      idContext(daycare),
    );
    expect(restored.status).toBe(StatusCodes.OK);
    expect(((await restored.json()) as ProgrammeView).isArchived).toBe(false);
  });

  it("reorders every Programme that is not archived", async () => {
    signInAsOwner(preschool);
    const ids = (await list()).map((programme) => programme.id);
    const reversed = [...ids].reverse();
    const response = await reorder(jsonRequest({ programmeIds: reversed }));
    expect(response.status).toBe(StatusCodes.OK);
    expect(
      ((await response.json()) as ProgrammeListView).items.map(
        (programme) => programme.id,
      ),
    ).toEqual(reversed);
    const partial = await reorder(
      jsonRequest({ programmeIds: reversed.slice(1) }),
    );
    expect(partial.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(partial)).toBe("PROGRAMME_ORDER_INVALID");
  });

  it("answers 404 for another Workspace's Programme", async () => {
    signInAsOwner(preschool);
    const foreign = other.programmeIds["LKG"] ?? "";
    expect(
      (await details(jsonRequest({ name: "Mine now" }), idContext(foreign)))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (await archive(new Request("http://localhost"), idContext(foreign)))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
    const reorderForeign = await reorder(
      jsonRequest({ programmeIds: Object.values(other.programmeIds) }),
    );
    expect(reorderForeign.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
