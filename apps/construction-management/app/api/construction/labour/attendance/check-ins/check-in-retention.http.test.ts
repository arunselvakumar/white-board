import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { DAILY_JOB_TYPES, drainQueue, enqueue } from "@/src/composition/queue";
import { CHECK_IN_PHOTO_RETENTION_JOB_TYPE } from "@/src/labour/application/check-in-retention";
import {
  createCheckInHandlers,
  createCheckInPhotoRetentionHandler,
} from "@/src/labour/infrastructure/check-in-factory";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { storedBytes } from "@/src/shared-kernel/files/stored-files";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getEntryPhoto } from "./[id]/photo/route";
import type { ListConstructionLabourCheckInEntriesResponseModel as LogPage } from "./check-in-models";
import { GET as listEntries } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/attendance/check-ins`;
const DAY_MS = 86_400_000;
const PHOTO = Buffer.from(pngBytes(4096)).toString("base64");

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** Runs one retention job through the queue on the given clock. */
async function runRetention(now: Date): Promise<void> {
  const id = await enqueue({
    type: CHECK_IN_PHOTO_RETENTION_JOB_TYPE,
    workspaceId: null,
    payload: { test: newId() },
    dedupeKey: `test:check-in-retention:${newId()}`,
  });
  const result = await drainQueue({
    ids: [id],
    handlers: [createCheckInPhotoRetentionHandler({ clock: () => now })],
  });
  expect(result.failed).toBe(0);
  const row = await prisma.constructionOrganizationQueueJob.findUniqueOrThrow({
    where: { id },
  });
  expect(row.status).toBe("done");
}

describe("check-in photo retention (ADR CM-0043 §6)", () => {
  it("is a daily job", () => {
    expect(DAILY_JOB_TYPES).toContain(CHECK_IN_PHOTO_RETENTION_JOB_TYPE);
  });

  it("removes photos 90 days after the entry and keeps the entry, its time and location", async () => {
    const company = await ownerWithCompany("Retention Builders");
    const projectId = await addProject(company.workspaceId, company.userId);
    const vendorId = newId();
    await prisma.constructionLabourVendor.create({
      data: {
        id: vendorId,
        workspaceId: company.workspaceId,
        name: "Selvam Gang",
        joiningDate: new Date("2026-01-01T00:00:00Z"),
        createdBy: "test",
        updatedBy: "test",
        projects: { create: [{ projectId }] },
      },
    });
    // Entries recorded on clocks 95 and 85 days back.
    const now = new Date();
    const recordAt = async (daysAgo: number) =>
      (
        await createCheckInHandlers({
          clock: () => new Date(now.getTime() - daysAgo * DAY_MS),
        }).record({
          workspaceId: company.workspaceId,
          userId: company.userId,
          projectId,
          kind: "vendor",
          personId: vendorId,
          action: "check_in",
          photo: PHOTO,
          location: { latitude: 13.0827, longitude: 80.2707 },
        })
      ).entry;
    const old = await recordAt(95);
    await createCheckInHandlers({
      clock: () => new Date(now.getTime() - 95 * DAY_MS + 3_600_000),
    }).record({
      workspaceId: company.workspaceId,
      userId: company.userId,
      projectId,
      kind: "vendor",
      personId: vendorId,
      action: "check_out",
      photo: PHOTO,
    });
    const recent = await recordAt(85);
    const rows = async () =>
      prisma.constructionLabourCheckInEvent.findMany({
        where: { workspaceId: company.workspaceId },
        orderBy: { occurredAt: "asc" },
      });
    const before = await rows();
    expect(before).toHaveLength(3);
    const keys = before.map((row) => row.photoKey ?? "");
    const storage = objectStorage();
    for (const key of keys) expect(await storage.head(key)).not.toBeNull();
    expect(await storedBytes(prisma, company.workspaceId)).toBe(3 * 4096);

    await runRetention(now);
    const after = await rows();
    expect(after.map((row) => row.photoKey)).toEqual([null, null, keys[2]]);
    expect(after[0]?.photoRemovedAt).toEqual(now);
    expect(after[1]?.photoRemovedAt).toEqual(now);
    expect(after[2]?.photoRemovedAt).toBeNull();
    // The entry stays: its time, its location, and it is not voided.
    expect(after[0]).toMatchObject({
      occurredAt: before[0]?.occurredAt,
      voidedAt: null,
    });
    expect(after[0]?.latitude?.toString()).toBe("13.0827");
    expect(await storage.head(keys[0] ?? "")).toBeNull();
    expect(await storage.head(keys[1] ?? "")).toBeNull();
    expect(await storage.head(keys[2] ?? "")).not.toBeNull();
    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: company.workspaceId, kind: "check_in_photo" },
      orderBy: { createdAt: "asc" },
    });
    expect(files.map((file) => file.deletedAt != null)).toEqual([
      true,
      true,
      false,
    ]);
    expect(await storedBytes(prisma, company.workspaceId)).toBe(4096);

    // The log reads "Photo removed"; the photo route answers 404.
    const photo = await getEntryPhoto(
      jsonRequest(`${BASE}/${old.id}/photo`, company.cookie),
      { params: Promise.resolve({ id: old.id }) },
    );
    expect(photo.status).toBe(StatusCodes.NOT_FOUND);
    const page = await json<LogPage>(
      await listEntries(
        jsonRequest(
          `${BASE}?projectId=${projectId}&date=${old.date}`,
          company.cookie,
        ),
      ),
    );
    expect(page.items.map((item) => item.hasPhoto)).toEqual([false, false]);

    // Again the same day: nothing more to do.
    await runRetention(now);
    expect((await rows())[2]?.photoKey).toBe(keys[2]);
    // Six days on, the 85-day-old entry's photo goes too.
    await runRetention(new Date(now.getTime() + 6 * DAY_MS));
    const last = (await rows())[2];
    expect(last?.photoKey).toBeNull();
    expect(last?.id).toBe(recent.id);
    expect(await storedBytes(prisma, company.workspaceId)).toBe(0);
  });
});
