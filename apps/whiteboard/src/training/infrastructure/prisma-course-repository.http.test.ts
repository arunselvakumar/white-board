import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { Course } from "../domain/course";
import { CourseDescription } from "../domain/course-description";
import { CourseDuration } from "../domain/course-duration";
import { CourseId } from "../domain/course-id";
import { CourseName } from "../domain/course-name";
import { Paise } from "../domain/paise";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import { PrismaCourseRepository } from "./prisma-course-repository";

const NOW = new Date("2026-09-12T12:00:00.000Z");

describe("PrismaCourseRepository", () => {
  it("round-trips a Course in the Active Workspace", async () => {
    const courses = new PrismaCourseRepository(prisma);
    const workspaceId = WorkspaceId.create(`org_${randomUUID()}`);
    const otherWorkspaceId = WorkspaceId.create(`org_${randomUUID()}`);
    const id = CourseId.create(randomUUID());
    const course = Course.create({
      id,
      workspaceId,
      createdByUserId: UserId.create("user_1"),
      name: CourseName.create("DCA"),
      duration: CourseDuration.create("3 months"),
      description: CourseDescription.create("Diploma in Computer Applications"),
      defaultFeeAmount: Paise.create(500000),
      now: NOW,
    });

    await courses.save(course);

    const loaded = await courses.findByIdInWorkspace(id, workspaceId);
    expect(loaded).not.toBeNull();
    expect(loaded?.name.value).toBe("DCA");
    expect(loaded?.defaultFeeAmount.value).toBe(500000);
    expect(loaded?.description?.value).toBe(
      "Diploma in Computer Applications",
    );

    expect(
      await courses.findByIdInWorkspace(id, otherWorkspaceId),
    ).toBeNull();

    const listed = await courses.listInWorkspace({
      workspaceId,
      limit: 20,
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.id.value).toBe(id.value);

    loaded?.update({
      name: CourseName.create("Tally"),
      duration: CourseDuration.create("45 days"),
      description: null,
      defaultFeeAmount: Paise.create(800000),
      now: new Date("2026-09-12T13:00:00.000Z"),
    });
    if (loaded == null) {
      throw new Error("expected Course to load");
    }
    await courses.save(loaded);

    const updated = await courses.findByIdInWorkspace(id, workspaceId);
    expect(updated?.name.value).toBe("Tally");
    expect(updated?.description).toBeNull();
  });
});
