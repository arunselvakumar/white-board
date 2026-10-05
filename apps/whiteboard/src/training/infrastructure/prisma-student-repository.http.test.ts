import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { Student, StudentProfile } from "../domain/student";
import { StudentId } from "../domain/student-id";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import { PrismaStudentRepository } from "./prisma-student-repository";

const NOW = new Date("2026-09-12T12:00:00.000Z");

describe("PrismaStudentRepository", () => {
  it("round-trips a Student in the Active Workspace", async () => {
    const students = new PrismaStudentRepository(prisma);
    const workspaceId = WorkspaceId.create(`org_${randomUUID()}`);
    const otherWorkspaceId = WorkspaceId.create(`org_${randomUUID()}`);
    const id = StudentId.create(randomUUID());
    const student = Student.create({
      id,
      workspaceId,
      createdByUserId: UserId.create("user_1"),
      profile: StudentProfile.fromRaw({
        name: "Anita Sharma",
        phone: "9876543210",
        email: "anita@example.com",
        guardianName: "Ravi Sharma",
        guardianPhone: "9123456780",
      }),
      now: NOW,
    });

    await students.save(student);

    const loaded = await students.findByIdInWorkspace(id, workspaceId);
    expect(loaded).not.toBeNull();
    expect(loaded?.name.value).toBe("Anita Sharma");
    expect(loaded?.phone.value).toBe("9876543210");
    expect(loaded?.deletedAt).toBeNull();

    expect(await students.findByIdInWorkspace(id, otherWorkspaceId)).toBeNull();

    loaded?.drop(UserId.create("user_2"), new Date("2026-09-12T14:00:00.000Z"));
    if (loaded == null) {
      throw new Error("expected Student to load");
    }
    await students.save(loaded);

    const dropped = await students.findByIdInWorkspace(id, workspaceId);
    expect(dropped?.droppedAt).not.toBeNull();
    expect(dropped?.deletedAt).toBeNull();

    const row = await prisma.student.findUnique({ where: { id: id.value } });
    expect(row?.droppedByUserId).toBe("user_2");
    expect(row?.deletedAt).toBeNull();
  });
});
