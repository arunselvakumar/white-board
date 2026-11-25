import { prisma } from "@repo/whiteboard-db";
import { StatusCodes } from "http-status-codes";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as archiveClassroom } from "../classrooms/[id]/archive/route";
import { POST as updateClassroom } from "../classrooms/[id]/details/route";
import {
  addChild,
  addClassroom,
  removePreschool,
  seedPreschool,
  signInAsOwner,
  type PreschoolFixture,
} from "../_lib/testing";
import { POST as admitChild } from "./route";

vi.mock(import("@repo/auth/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuth: vi.fn(),
}));

// An admission locks the Classroom row before counting seats; changing the
// capacity or archiving takes the same lock, so neither can slip in between.

async function post(
  handler: (
    request: Request,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>,
  body: unknown,
  id = "",
): Promise<number> {
  const response = await handler(
    new Request("http://localhost/api/preschool", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return response.status;
}

const ROUNDS = 6;

describe("Classroom changes racing an admission", () => {
  let preschool: PreschoolFixture;
  let seq = 0;

  function admission(classroomId: string) {
    seq += 1;
    return {
      centreId: preschool.centreId,
      child: {
        firstName: `Racer ${String(seq)}`,
        dateOfBirth: "2023-03-10",
        gender: "girl",
      },
      father: { phone: `96${String(seq).padStart(8, "0")}` },
      admission: {
        programmeId: preschool.programmeIds["Nursery (Pre-KG)"],
        classroomId,
      },
    };
  }

  async function activeIn(classroomId: string): Promise<number> {
    return prisma.preschoolAdmission.count({
      where: { classroomId, status: "active" },
    });
  }

  beforeAll(async () => {
    preschool = await seedPreschool();
    signInAsOwner(preschool);
  });

  afterAll(async () => {
    await removePreschool(preschool);
  });

  it("never leaves more active Admissions than the capacity", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const classroomId = await addClassroom(preschool, {
        name: `Capacity ${String(round)}`,
        capacity: 2,
      });
      await addChild(preschool, { classroomId });
      const [admitted, lowered] = await Promise.all([
        post(admitChild, admission(classroomId)),
        post(
          updateClassroom,
          { name: `Capacity ${String(round)}`, capacity: 1 },
          classroomId,
        ),
      ]);
      const room = await prisma.preschoolClassroom.findUniqueOrThrow({
        where: { id: classroomId },
      });
      expect(await activeIn(classroomId)).toBeLessThanOrEqual(room.capacity);
      expect([admitted, lowered]).toContain(StatusCodes.CONFLICT);
    }
  });

  it("never leaves an active Admission in an archived Classroom", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const classroomId = await addClassroom(preschool, {
        name: `Archive ${String(round)}`,
      });
      const [admitted, archived] = await Promise.all([
        post(admitChild, admission(classroomId)),
        post(archiveClassroom, {}, classroomId),
      ]);
      const room = await prisma.preschoolClassroom.findUniqueOrThrow({
        where: { id: classroomId },
      });
      const active = await activeIn(classroomId);
      if (room.archivedAt != null) expect(active).toBe(0);
      expect([admitted, archived]).toContain(StatusCodes.CONFLICT);
    }
  });
});
