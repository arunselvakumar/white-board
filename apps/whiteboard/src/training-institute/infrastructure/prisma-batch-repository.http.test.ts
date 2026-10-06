import { randomUUID } from "node:crypto";

import { prisma } from "@repo/db";
import { describe, expect, it } from "vitest";

import { Batch, batchRoom } from "../domain/batch";
import { BatchId } from "../domain/batch-id";
import { BatchName } from "../domain/batch-name";
import { Capacity } from "../domain/capacity";
import { ClassMode } from "../domain/class-mode";
import { Course } from "../domain/course";
import { CourseDuration } from "../domain/course-duration";
import { CourseDetails } from "../domain/course-details";
import { CourseId } from "../domain/course-id";
import { CourseName } from "../domain/course-name";
import { Paise } from "../domain/paise";
import { UserId } from "../domain/user-id";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import { PrismaBatchRepository } from "./prisma-batch-repository";
import { PrismaCourseRepository } from "./prisma-course-repository";

const NOW = new Date("2026-09-12T12:00:00.000Z");

describe("PrismaBatchRepository", () => {
  it("round-trips a Batch for a Course", async () => {
    const workspaceId = WorkspaceId.create(`org_${randomUUID()}`);
    const courseId = CourseId.create(randomUUID());
    const courses = new PrismaCourseRepository(prisma);
    await courses.save(
      Course.create({
        id: courseId,
        workspaceId,
        createdByUserId: UserId.create("user_1"),
        name: CourseName.create("DCA"),
        duration: CourseDuration.create({
          kind: "fixed",
          value: 3,
          unit: "months",
        }),
        details: CourseDetails.create({}),
        description: null,
        defaultFeeAmount: Paise.create(500000),
        now: NOW,
      }),
    );
    const batches = new PrismaBatchRepository(prisma);
    const id = BatchId.create(randomUUID());
    await batches.save(
      Batch.create({
        id,
        workspaceId,
        courseId,
        createdByUserId: UserId.create("user_1"),
        name: BatchName.create("DCA Weekday 9–11 Offline"),
        classMode: ClassMode.create("offline"),
        capacity: Capacity.create(20),
        room: batchRoom("Lab 1"),
        joinUrl: null,
        timings: WeeklyTimings.create([
          {
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: "09:00",
            endTime: "11:00",
          },
        ]),
        now: NOW,
      }),
    );
    const loaded = await batches.findByIdInWorkspace(id, workspaceId);
    expect(loaded?.name.value).toBe("DCA Weekday 9–11 Offline");
    expect(loaded?.classMode.value).toBe("offline");
    expect(loaded?.timings.slots[0]?.startTime).toBe("09:00");
  });
});
