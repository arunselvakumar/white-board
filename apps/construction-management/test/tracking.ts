import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";
import { vi } from "vitest";

import { calendarDateToDb, todayIn } from "@/src/shared-kernel/calendar-date";
import {
  InProcessEventDispatcher,
  type DomainEvent,
} from "@/src/shared-kernel/events";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import {
  insertIssueRow,
  type NewIssueRow,
} from "@/src/tracking/infrastructure/issue-rows";

/**
 * Tracking test helpers (M8). Rows are written straight to
 * `construction_tracking` for tests that only need them to exist (usage
 * guards, the Gallery, document files). Append-only: each M8 ticket adds
 * its helpers below its own heading.
 */

const TODAY = todayIn("Asia/Kolkata");

function stamp(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

const json = (ref: LocationRef | null | undefined) =>
  ref == null
    ? {}
    : {
        siteLocationType: ref.type,
        siteLocation: JSON.parse(JSON.stringify(ref)) as Prisma.InputJsonValue,
      };

// ---------------------------------------------------------------------------
// CM-801 foundation
// ---------------------------------------------------------------------------

/** A live leaf task on the Project, numbered after the Project's last. */
export async function trackingTaskRow(
  workspaceId: string,
  projectId: string,
  by: string,
  options: {
    name?: string;
    siteLocation?: LocationRef | null;
    extraLocations?: readonly LocationRef[];
    departmentId?: string | null;
    contractorId?: string | null;
    unitId?: string | null;
    tagIds?: readonly string[];
    deleted?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const last = await prisma.constructionTrackingTask.aggregate({
    where: { projectId },
    _max: { taskNo: true, sortOrder: true },
  });
  const taskNo = (last._max.taskNo ?? 0) + 1;
  // Keep the Project's counter at least here, so a task created through the
  // API afterwards takes the next number instead of colliding with this one.
  await prisma.$executeRaw`
    INSERT INTO construction_tracking.task_counters
      (project_id, workspace_id, last_no, updated_at)
    VALUES (${projectId}::uuid, ${workspaceId}, ${taskNo}, now())
    ON CONFLICT (project_id) DO UPDATE
      SET last_no = GREATEST(
            construction_tracking.task_counters.last_no, EXCLUDED.last_no),
          updated_at = now()`;
  await prisma.constructionTrackingTask.create({
    data: {
      id,
      workspaceId,
      projectId,
      taskNo,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      name: options.name ?? `Shuttering ${id.slice(0, 6)}`,
      ...json(options.siteLocation),
      ...(options.extraLocations == null
        ? {}
        : {
            extraLocations: JSON.parse(
              JSON.stringify(options.extraLocations),
            ) as Prisma.InputJsonValue,
          }),
      departmentId: options.departmentId ?? null,
      contractorId: options.contractorId ?? null,
      ...(options.unitId == null
        ? {}
        : {
            totalWorkQty: new Prisma.Decimal("10"),
            totalWorkUnitId: options.unitId,
          }),
      tags: {
        create: (options.tagIds ?? []).map((tagId) => ({ tagId })),
      },
      deletedAt: options.deleted === true ? new Date() : null,
      deletedBy: options.deleted === true ? by : null,
      ...stamp(by),
    },
  });
  return id;
}

/** A live issue through the shared writer (ISS numbering, events, audit). */
export async function trackingIssueRow(
  workspaceId: string,
  projectId: string,
  by: string,
  options: Partial<
    Omit<NewIssueRow, "workspaceId" | "projectId" | "by" | "at">
  > & { deleted?: boolean } = {},
): Promise<{ id: string; number: string }> {
  const { deleted, ...row } = options;
  const inserted = await prisma.$transaction((tx) =>
    insertIssueRow(tx, {
      workspaceId,
      projectId,
      by,
      at: new Date(),
      issueDate: TODAY,
      details: "Plaster cracks on the east wall",
      priority: null,
      categoryId: null,
      departmentId: null,
      contractorId: null,
      assigneeMemberId: null,
      dueDate: null,
      siteLocation: null,
      status: "open",
      sourceInspectionId: null,
      ...row,
    }),
  );
  if (deleted === true)
    await prisma.constructionTrackingIssue.update({
      where: { id: inserted.id },
      data: { deletedAt: new Date(), deletedBy: by },
    });
  return inserted;
}

/** A live pending Inspection Request, linking these drawings. */
export async function trackingInspectionRow(
  workspaceId: string,
  projectId: string,
  by: string,
  options: {
    siteLocation?: LocationRef | null;
    departmentId?: string | null;
    contractorId?: string | null;
    drawingIds?: readonly string[];
    deleted?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionTrackingInspection.create({
    data: {
      id,
      workspaceId,
      projectId,
      number: `IR/TEST/${id.slice(0, 8)}`,
      inspectionDate: calendarDateToDb(TODAY),
      workDescription: "Slab reinforcement before the pour",
      ...json(options.siteLocation),
      departmentId: options.departmentId ?? null,
      contractorId: options.contractorId ?? null,
      drawings: {
        create: (options.drawingIds ?? []).map((drawingId) => ({ drawingId })),
      },
      deletedAt: options.deleted === true ? new Date() : null,
      deletedBy: options.deleted === true ? by : null,
      ...stamp(by),
    },
  });
  return id;
}

/** A drawing in a new album of the Project, with no revision. */
export async function trackingDrawing(
  workspaceId: string,
  projectId: string,
  by: string,
): Promise<string> {
  const albumId = randomUUID();
  const id = randomUUID();
  await prisma.constructionProjectsDrawingAlbum.create({
    data: {
      id: albumId,
      workspaceId,
      projectId,
      name: `Structural ${albumId.slice(0, 6)}`,
      ...stamp(by),
    },
  });
  await prisma.constructionProjectsDrawing.create({
    data: {
      id,
      workspaceId,
      projectId,
      albumId,
      name: "Ground floor slab",
      ...stamp(by),
    },
  });
  return id;
}

/** A name-only master row of the Company: an Issue Category or a Tag. */
export async function trackingMaster(
  kind: "issue_category" | "tag",
  workspaceId: string,
  by: string,
  options: { name?: string; disabled?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const name = options.name ?? `${kind} ${id.slice(0, 6)}`;
  if (kind === "tag")
    await prisma.constructionMastersTag.create({
      data: { id, workspaceId, name, ...stamp(by) },
    });
  else
    await prisma.constructionMastersIssueCategory.create({
      data: {
        id,
        workspaceId,
        name,
        disabledAt: options.disabled === true ? new Date() : null,
        ...stamp(by),
      },
    });
  return id;
}

/**
 * Makes every in-process `ProjectMediaRemoved` dispatch fail (the Gallery
 * listener throwing) until `restore()`, and silences the error the
 * handlers log for it; `logged` is that `console.error` spy.
 */
export function failGalleryRemovals() {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the dispatcher as `this` below
  const original = InProcessEventDispatcher.prototype.dispatch;
  const dispatch = vi
    .spyOn(InProcessEventDispatcher.prototype, "dispatch")
    .mockImplementation(function (
      this: InProcessEventDispatcher,
      events: readonly DomainEvent[],
    ) {
      if (events.some((event) => event.type === "ProjectMediaRemoved"))
        return Promise.reject(new Error("The Gallery is down"));
      return original.call(this, events);
    });
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return {
    logged,
    restore: () => {
      dispatch.mockRestore();
      logged.mockRestore();
    },
  };
}
